import yaml
import os
from crewai import Agent, Task
from helper import get_openai_api_key

def load_llm():
    """
    Load the LLM with env-driven settings.

    Environment variables:
    - OPENAI_MODEL (default: gpt-5)
    - OPENAI_TEMPERATURE (default: 0.0)
    """
    api_key = get_openai_api_key()
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment!")
    model = (os.getenv("OPENAI_MODEL") or "gpt-5").strip()
    try:
        temperature = float((os.getenv("OPENAI_TEMPERATURE") or "0.0").strip())
    except ValueError:
        temperature = 0.0
    is_gpt5_family = model.lower().startswith("gpt-5")
    # Prefer CrewAI's LLM wrapper when available so we can drop unsupported params (e.g., stop for GPT-5).
    try:
        from crewai import LLM
        # CrewAI routes through LiteLLM; enable unsupported-param dropping globally.
        # This avoids GPT-5 errors like: Unsupported parameter 'stop'.
        try:
            import litellm
            litellm.drop_params = True
        except Exception:
            pass
        kwargs = {
            "model": model,
            "api_key": api_key,
        }
        # GPT-5 currently accepts only the default temperature; omit this param.
        if not is_gpt5_family:
            kwargs["temperature"] = temperature
        return LLM(**kwargs)
    except Exception:
        # Backward compatibility with older CrewAI stacks.
        from langchain_openai import ChatOpenAI
        if model.startswith("gpt-5"):
            raise RuntimeError(
                "OPENAI_MODEL is set to gpt-5, but this CrewAI version does not expose `LLM` "
                "required to drop unsupported `stop` params. Upgrade CrewAI/LangChain pins in "
                "requirements.txt, then reinstall dependencies."
            )
        return ChatOpenAI(
            temperature=1.0 if is_gpt5_family else temperature,
            model=model,
            openai_api_key=api_key,
        )

def load_agents_from_yaml(yaml_path, llm):
    """
    Returns a dictionary of agents keyed by their id.
    """
    with open(yaml_path, 'r') as f:
        data = yaml.safe_load(f)

    agent_dict = {}
    for a in data.get('agents', []):
        agent_obj = Agent(
            name=a['id'],
            role=a.get('role', ''),
            goal=a.get('description', ''),
            backstory='',
            tools=[],
            llm=llm,
            verbose=True
        )
        agent_dict[a['id']] = agent_obj
    return agent_dict

# def load_tasks_from_yaml(yaml_path, agent_dict):
#     """
#     Returns a list of Task objects.
#     For each YAML task with multiple agents, creates one Task per agent.
#     """
#     with open(yaml_path, 'r') as f:
#         data = yaml.safe_load(f)
#
#     tasks = []
#     for t in data.get('tasks', []):
#         agent_ids = t.get('agents', [])
#         if not agent_ids:
#             # No agents listed
#             task_obj = Task(
#                 name=f"{t['name']} - {agent_id}",
#                 description=t['description'],
#                 expected_output=t.get('expected_output', 'Detailed answer expected.'),
#                 agent=agent_dict[agent_id]
#             )
#
#             tasks.append(task_obj)
#         else:
#             for agent_id in agent_ids:
#                 if agent_id in agent_dict:
#                     task_obj = Task(
#                         name=f"{t['name']} - {agent_id}",
#                         description=t['description'],
#                         expected_output=t.get('expected_output', 'Detailed answer expected.'),
#                         agent=agent_dict[agent_id]
#                     )
#
#                     tasks.append(task_obj)
#                 else:
#                     print(f"Warning: Agent id '{agent_id}' not found in agents.yaml")
#     return tasks
def load_tasks_from_yaml(yaml_path, agent_dict):
    """
    Returns a list of Task objects.
    For each YAML task with multiple agents, creates one Task per agent.
    """
    with open(yaml_path, 'r') as f:
        data = yaml.safe_load(f)

    tasks = []
    for t in data.get('tasks', []):
        expected_output = t.get('expected_output', 'Provide a clear and detailed answer.')

        agent_ids = t.get('agents', [])
        if not agent_ids:
            # No agents listed
            task_obj = Task(
                name=t['name'],
                description=t['description'],
                expected_output=expected_output,
                agent=None
            )
            tasks.append(task_obj)
        else:
            for agent_id in agent_ids:
                if agent_id in agent_dict:
                    task_obj = Task(
                        name=f"{t['name']} - {agent_id}",
                        description=t['description'],
                        expected_output=expected_output,
                        agent=agent_dict[agent_id]
                    )
                    tasks.append(task_obj)
                else:
                    print(f"Warning: Agent id '{agent_id}' not found in agents.yaml")
    return tasks

