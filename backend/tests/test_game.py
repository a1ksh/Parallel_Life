from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.scenarios import CATALOG


@pytest.fixture
def game_api(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    url = f"sqlite:///{tmp_path / 'game.sqlite'}"
    token = str(uuid4()) + str(uuid4())
    with TestClient(create_app(url, serve_frontend=False), headers={"X-Guest-Token": token}) as client:
        yield client, token, url


def start(client, scenario_id="career"):
    profile = client.post("/api/profiles", json={"name": "Avery", "age": 29, "avatar": "dawn",
                         "situation": "Working", "goal": "Explore a choice", "category": scenario_id})
    assert profile.status_code == 201, profile.text
    response = client.post("/api/sessions", json={"profile_id": profile.json()["id"], "scenario_id": scenario_id})
    assert response.status_code == 201, response.text
    return f"/api/sessions/{response.json()['id']}"


def branch(client, url, **payload):
    response = client.post(f"{url}/branches", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def decide(client, url, branch_id, index, choice):
    response = client.post(f"{url}/branches/{branch_id}/choices",
                           json={"scene_index": index, "choice_id": str(choice)})
    assert response.status_code == 200, response.text
    return response.json()


def chat(client, url, branch_id, index, npc, message):
    response = client.post(f"{url}/branches/{branch_id}/npcs/{npc}/messages",
                           json={"scene_index": index, "text": message})
    assert response.status_code == 200, response.text
    return response.json()


def active(game):
    return next(branch for branch in game["branches"] if branch["id"] == game["active_id"])


@pytest.mark.parametrize("scenario", CATALOG, ids=[scenario["id"] for scenario in CATALOG])
def test_all_paths_and_endings(game_api, scenario):
    client, _, _ = game_api
    url = start(client, scenario["id"])
    catalog = client.get("/api/scenarios").json()
    assert len(catalog) == 3
    assert all(len(item["paths"]) == 3 for item in catalog)
    for path in scenario["paths"]:
        for choice in (0, 1):
            game = branch(client, url, path_id=path["id"])
            original = active(game)["world"]
            branch_id = game["active_id"]
            for index in range(4):
                scene = active(game)["scene"]
                assert len(scene["choices"]) >= 2
                assert len(set(scene["npcs"])) >= 2
                game = decide(client, url, branch_id, index, choice)
            assert active(game)["world"] != original
            assert active(game)["ending"] == choice
    compare = client.get(f"{url}/comparison").json()
    assert len({end["title"] for end in compare}) == 6
    assert all(len(end["events"]) == 4 and end["gain"] and end["cost"] for end in compare)


def test_checkpoint_isolation_and_reload(game_api):
    client, token, url = game_api
    session = start(client)
    source = branch(client, session, path_id="business")["active_id"]
    chat(client, session, source, 0, "emma", "What is your goal?")
    first = decide(client, session, source, 0, 0)
    first_world = active(first)["world"]
    remembered = chat(client, session, source, 1, "emma", "What happened earlier?")
    replies = active(remembered)["npcs"]["emma"]["messages"]
    assert replies[-1]["mode"] == "scripted"
    assert "small paid pilot" in replies[-1]["text"]
    forked = branch(client, session, parent_id=source, checkpoint=0)
    fork_id = forked["active_id"]
    assert active(forked)["events"] == []
    assert len(active(forked)["npcs"]["emma"]["messages"]) == 2
    decide(client, session, fork_id, 0, 1)
    chat(client, session, fork_id, 1, "emma", "I want this to stay independent.")
    duplicate = client.post(f"{session}/branches/{fork_id}/choices",
                            json={"scene_index": 0, "choice_id": "0"})
    assert duplicate.status_code == 409
    with TestClient(create_app(url, serve_frontend=False), headers={"X-Guest-Token": token}) as restarted:
        original = restarted.put(f"{session}/branches/{source}/active").json()
        assert active(original)["world"] == first_world
        assert active(original)["npcs"]["emma"]["messages"] == replies
        assert restarted.get(session, headers={"X-Guest-Token": str(uuid4())}).status_code == 404


def test_reflection_experiment_and_deletion(game_api):
    client, _, _ = game_api
    session = start(client, "education")
    branch_id = branch(client, session, path_id="abroad")["active_id"]
    for index in range(4):
        decide(client, session, branch_id, index, 0)
    passport = client.put(f"{session}/reflection", json={"priorities": ["Community"], "next_step": "Compare two programs."})
    assert passport.status_code == 200, passport.text
    assert len(passport.json()["passport"]["timelines"]) == 1
    result = client.put(f"{session}/experiment", json={"checked": [0, 2, 2], "status": "active"})
    assert result.status_code == 200, result.text
    assert client.get(session).json()["experiment"]["checked"] == [0, 2]
    assert client.delete(session).status_code == 204
    assert client.get(session).status_code == 404
    assert client.get("/api/profiles").json() == []


def test_trust_unlocks_later_option(game_api):
    client, _, _ = game_api
    session = start(client)
    yes = branch(client, session, path_id="business")["active_id"]
    decide(client, session, yes, 0, 0)
    higher_trust = decide(client, session, yes, 1, 0)
    assert len(active(higher_trust)["scene"]["choices"]) == 3
    no = branch(client, session, path_id="business")["active_id"]
    decide(client, session, no, 0, 1)
    lower_trust = decide(client, session, no, 1, 1)
    assert len(active(lower_trust)["scene"]["choices"]) == 2
