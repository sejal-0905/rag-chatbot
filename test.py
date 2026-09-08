import os
import json
from dotenv import load_dotenv
load_dotenv()

from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    api_key=os.environ.get("GROQ_API_KEY"),
    temperature=0.2,
)

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
    return response.content

@tool
def check_answers(quiz_json: str, student_answers: str) -> str:
    """Check a student's quiz answers against the correct answers.
    Input quiz_json is the JSON array of questions from generate_quiz.
    Input student_answers is a JSON array of the student's chosen letters, in the same order as the questions.
    Returns details on what was answered wrong, including the question, the student's wrong answer,
    the correct answer, and the explanation — so you have enough detail to teach the specific concept.
    Use this after the student has answered a quiz you generated."""
    quiz = json.loads(quiz_json)
    answers = json.loads(student_answers)
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
    return response.content

tools = [generate_quiz, check_answers, generate_notes]
llm_with_tools = llm.bind_tools(tools)
tool_node = ToolNode(tools)

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]

def call_model(state: AgentState):
    response = llm_with_tools.invoke(state["messages"])
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
app = graph.compile()

# --- Step 1: generate a real quiz ---

def ask_user_to_answer_quiz(quiz_json_str):
    quiz_questions = json.loads(quiz_json_str)
    print("\n--- QUIZ TIME ---\n")
    answers = []
    for i, q in enumerate(quiz_questions):
        print(f"Q{i+1}: {q['question']}")
        for key, val in q["options"].items():
            print(f"  {key}) {val}")
        ans = input("Your answer (a/b/c/d): ").strip().lower()
        answers.append(ans)
        print()
    return quiz_questions, answers

# Start the conversation
messages = [HumanMessage(content=(
    "The student is learning about heart disease risk factors. "
    "Generate a quiz for them. After they answer, check their answers. "
    "If they got anything wrong, generate focused notes on exactly what they need to review, "
    "then generate a short follow-up quiz testing only those weak topics. "
    "Keep looping this way until the student gets a quiz fully correct, then stop and congratulate them."
))]

state = {"messages": messages}
pending_quiz_call_id = None

seen_message_count = 0

while True:
    state = app.invoke(state)
    last_message = state["messages"][-1]

    # Print every NEW message since last time, so nothing gets skipped silently
    new_messages = state["messages"][seen_message_count:]
    seen_message_count = len(state["messages"])

    for m in new_messages:
        if m.__class__.__name__ == "ToolMessage":
            if m.name == "check_answers":
                print("\n--- CHECK RESULT ---")
                print(m.content)
            elif m.name == "generate_notes":
                print("\n--- NOTES ---")
                notes = json.loads(m.content)
                print(notes["title"])
                for point in notes["points"]:
                    print(f"  - {point}")

    # Look through NEW messages for a quiz that hasn't been answered yet
    found_new_quiz = False
    for m in new_messages:
        if m.__class__.__name__ == "ToolMessage" and m.name == "generate_quiz":
            pending_quiz_call_id = m.tool_call_id
            quiz_questions, your_answers = ask_user_to_answer_quiz(m.content)
            state["messages"].append(HumanMessage(content=(
                f"The student answered this quiz: {json.dumps(your_answers)}"
            )))
            found_new_quiz = True
            break

    if found_new_quiz:
        continue

    if not getattr(last_message, "tool_calls", None):
        print("\n--- FINAL RESULT ---\n")
        print(last_message.content)
        break