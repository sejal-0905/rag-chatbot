import os
import json
import re
from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

llm = ChatGroq(
    model="openai/gpt-oss-120b",
    api_key=os.environ.get("GROQ_API_KEY"),
    temperature=0.2,
)

def clean_json_text(raw: str) -> str:
    raw = (raw or "").replace("```json", "").replace("```", "").strip()
    first = next((i for i, c in enumerate(raw) if c in "{["), -1)
    last = next((i for i in range(len(raw)-1, -1, -1) if raw[i] in "}]"), -1)
    if first != -1 and last != -1 and last > first:
        raw = raw[first:last+1]
    return raw


@tool
def generate_quiz(context: str) -> str:
    """Generate 3 multiple choice quiz questions based on the given context.
    Use this when you need to test what the student already knows about a topic."""
    response = llm.invoke(
        f"Based on the context below, create 3 multiple choice questions.\n"
        f"Return ONLY a JSON array of objects with keys 'question', 'options' "
        f"(object with keys a/b/c/d), 'answer' (one of a/b/c/d), 'explanation'.\n"
        f"No markdown, no extra text, no explanation. Just the JSON.\n\n"
        f"Context:\n{context}"
    )
    return clean_json_text(response.content)

@tool
def check_answers(quiz_json: str, student_answers: str) -> str:
    """Check a student's quiz answers against the correct answers.
    Input quiz_json is the JSON array of questions from generate_quiz.
    Input student_answers is a JSON array of the student's chosen letters, in the same order as the questions.
    Returns details on what was answered wrong, including the question, the student's wrong answer,
    the correct answer, and the explanation — so you have enough detail to teach the specific concept.
    Use this after the student has answered a quiz you generated."""
    try:
        quiz = json.loads(quiz_json)
        answers = json.loads(student_answers)
    except json.JSONDecodeError:
        return json.dumps({"correct_count": 0, "total": 0, "wrong_details": [], "error": "Could not parse quiz or answers."})

    wrong_details = []
    correct_count = 0
    for i, q in enumerate(quiz):
        given = answers[i] if i < len(answers) else None
        if given == q["answer"]:
            correct_count += 1
        else:
            wrong_details.append({
                "question": q["question"],
                "student_answer": q["options"].get(given, "no answer"),
                "correct_answer": q["options"][q["answer"]],
                "explanation": q.get("explanation", "")
            })
    return json.dumps({"correct_count": correct_count, "total": len(quiz), "wrong_details": wrong_details})

@tool
def generate_notes(wrong_details: str) -> str:
    """Generate focused study notes that directly address specific mistakes a student made.
    Input wrong_details is the JSON array from check_answers, containing the question, the student's
    wrong answer, the correct answer, and the explanation for each mistake.
    Use this after check_answers to teach exactly the concept the student got wrong, not just the general topic."""
    response = llm.invoke(
        f"A student got these specific quiz questions wrong:\n{wrong_details}\n\n"
        f"For each mistake, write a note that clearly explains the correct concept, directly addressing "
        f"why their answer was wrong and what the right answer actually means. Be specific, not generic.\n\n"
        f"Return ONLY a JSON object with keys 'title' (string) and 'points' (array of strings). "
        f"No markdown, no extra text. Just the JSON."
    )
    return clean_json_text(response.content)

tools = [generate_quiz, check_answers, generate_notes]
llm_with_tools = llm.bind_tools(tools)
tool_node = ToolNode(tools)

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]

def call_model(state: AgentState):
    messages = state["messages"]
    force_notes = False
    if messages:
        last = messages[-1]
        if getattr(last, "name", None) == "check_answers":
            try:
                result = json.loads(last.content)
                if result.get("wrong_details"):
                    force_notes = True
            except Exception:
                pass

    if force_notes:
        response = llm.bind_tools(tools, tool_choice="generate_notes").invoke(messages)
    else:
        response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

def should_continue(state: AgentState):
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return END

graph = StateGraph(AgentState)
graph.add_node("agent", call_model)
graph.add_node("tools", tool_node)
graph.set_entry_point("agent")
graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
graph.add_edge("tools", "agent")

memory = MemorySaver()
study_agent_app = graph.compile(checkpointer=memory)


def start_study_session(topic_context: str, thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    initial_message = HumanMessage(content=(
        f"The student is learning about: {topic_context}. Generate a quiz for them."
    ))
    result = study_agent_app.invoke({"messages": [initial_message]}, config=config)
    return result["messages"]


def continue_study_session(thread_id: str, student_answers: list):
    config = {"configurable": {"thread_id": thread_id}}
    print(f"DEBUG: continue_study_session called for thread {thread_id}")
    answer_message = HumanMessage(content=(
        f"The student answered the quiz with: {json.dumps(student_answers)}. "
        f"Step 1: Call check_answers to see what they got wrong.\n"
        f"Step 2: If wrong_details is non-empty, you MUST call generate_notes, passing it the "
        f"wrong_details exactly as returned by check_answers. Do not write the explanation "
        f"yourself in plain text — the generate_notes tool must produce it. Do not call generate_quiz.\n"
        f"Step 3: After the tool results come back, reply with ONLY one short sentence "
        f"(e.g. 'Here's what to review.' or 'Nice work, you got everything right!'). "
        f"Do not repeat, restate, or summarize the notes content yourself — it's already "
        f"shown separately. Keep your final reply under 15 words."
    ))
    result = study_agent_app.invoke({"messages": [answer_message]}, config=config)
    print("DEBUG: message sequence this round:")
    for m in result["messages"]:
        print(f"  - {m.__class__.__name__} | name={getattr(m, 'name', None)} | tool_calls={getattr(m, 'tool_calls', None)}")
    return result["messages"]