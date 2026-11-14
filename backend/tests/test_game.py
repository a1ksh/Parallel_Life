import asyncio
import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.scenarios import CATALOG
from app.services import ai_limits, story


@pytest.fixture
def game_api(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("PARALLEL_LIFE_AI_PROVIDER", raising=False)
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
            for index in range(5):
                scene = active(game)["scene"]
                assert len(scene["choices"]) >= 2
                assert len(set(scene["npcs"])) >= 2
                assert scene["count"] == 5
                preview = scene["choices"][choice]["effects"]
                game = decide(client, url, branch_id, index, choice)
                assert active(game)["events"][-1]["effects"] == preview
            assert active(game)["world"] != original
            assert active(game)["ending"] == choice
    compare = client.get(f"{url}/comparison").json()
    assert len({end["title"] for end in compare}) == 6
    assert all(len(end["events"]) == 5 and end["gain"] and end["cost"] and end["aftermath"] for end in compare)


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
    assert "What is your goal?" in replies[-1]["text"]
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
    for index in range(5):
        decide(client, session, branch_id, index, 0)
    passport = client.put(f"{session}/reflection", json={"priorities": ["Community"], "next_step": "Compare two programs."})
    assert passport.status_code == 200, passport.text
    assert len(passport.json()["passport"]["timelines"]) == 1
    assert len(passport.json()["passport"]["questions"]) == 2
    result = client.put(f"{session}/experiment", json={"checked": [0, 2, 2], "status": "active"})
    assert result.status_code == 200, result.text
    assert client.get(session).json()["experiment"]["checked"] == [0, 2]
    endpoint = f"{session}/experiment"
    plan = {"action": "Ask one graduate", "deadline": "2026-11-21", "signal": "One concrete example"}
    notes = {"outcome": "They replied", "surprise": "They mentioned debt", "priority": "Community still matters"}
    assert client.put(endpoint, json={"reflection": notes}).status_code == 409
    assert client.put(endpoint, json={"plan": {**plan, "deadline": "2026-02-30"}}).status_code == 422
    assert client.put(endpoint, json={"plan": plan}).status_code == 200
    assert client.put(endpoint, json={"reflection": notes, "status": "completed"}).status_code == 200
    assert client.put(endpoint, json={"pass_interest": "interested"}).json()["experiment"]["pass_offer"] is None
    assert client.put(endpoint, json={"pass_interest": "interested", "pass_offer": "KZT_1490"}).status_code == 200
    assert client.put(endpoint, json={"personal_1490_interest": "invalid"}).status_code == 422
    assert client.put(endpoint, json={"personal_1490_interest": "declined"}).status_code == 200
    saved = client.get(session).json()
    assert saved["experiment"] == {"plan": plan, "reflection": notes, "status": "completed",
                                   "checked": [0, 2], "personal_1490_interest": "declined", "pass_interest": "interested", "pass_offer": "KZT_1490"}
    assert saved["passport"] == passport.json()["passport"]
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


def test_hybrid_dialogue_uses_only_current_timeline_and_keeps_personality(game_api, monkeypatch):
    client, token, url = game_api
    session = start(client)
    source = branch(client, session, path_id="business")["active_id"]
    chat(client, session, source, 0, "emma", "The greenhouse customers matter most to me.")
    for i in range(3):
        chat(client, session, source, 0, "emma", f"Other topic {i}.")
    decide(client, session, source, 0, 0)
    chat(client, session, source, 1, "emma", "Source-only detail: blue ledger.")
    captured = []
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    monkeypatch.setenv("PARALLEL_LIFE_AI_ENABLED", "1")

    async def post(self, url, **kwargs):
        assert url == story.PROVIDER_URL
        assert kwargs["headers"]["Authorization"] == "Bearer test-only"
        payload = kwargs["json"]
        assert payload["store"] is False and payload["max_output_tokens"] == 420
        assert payload["text"]["format"]["strict"] is True
        captured.append(json.loads(payload["input"]))
        return provider_response({"reply": "I want a partner, and I’d price the pilot before we commit."})

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    original = chat(client, session, source, 1, "emma", "What about the greenhouse customers?")
    assert active(original)["npcs"]["emma"]["messages"][-1]["mode"] == "live"
    fork = branch(client, session, parent_id=source, checkpoint=0)["active_id"]
    forked = chat(client, session, fork, 0, "emma", "Do you remember the greenhouse?")
    assert "price the pilot" in active(forked)["npcs"]["emma"]["messages"][-1]["text"]
    before, after = captured
    assert before["npc"] == after["npc"]
    assert before["npc"]["name"] == "Aigerim Omarova" and before["npc"]["goal"]
    assert before["timeline"] == after["timeline"]
    assert "greenhouse" in before["earlier_player_statements"][0]["text"]
    assert "greenhouse" in after["earlier_player_statements"][0]["text"]
    assert "blue ledger" in str(before["recent"]) and "blue ledger" not in str(after)
    assert before["events"][0]["choice"] == "Offer a small paid pilot"
    assert after["events"] == []
    with TestClient(create_app(url, serve_frontend=False), headers={"X-Guest-Token": token}) as restarted:
        reloaded = active(restarted.get(session).json())
        assert reloaded["id"] == fork and reloaded["events"] == []
        assert reloaded["npcs"]["emma"]["messages"][-1]["mode"] == "live"


def test_language_switch_keeps_npc_history_trust_and_choices(game_api):
    client, _, _ = game_api
    session = start(client)
    original = branch(client, session, path_id="business")
    branch_id = original["active_id"]
    endpoint = f"{session}/branches/{branch_id}/npcs/emma/messages"
    for locale, text, reply in (
        ("en", "The greenhouse matters.", "I can help"),
        ("kk", "Бұрын айтқаным есіңде ме?", "Бұрын айтқаның есімде"),
        ("ru", "Какая у тебя цель?", "Вот к чему я стремлюсь"),
    ):
        response = client.post(endpoint, json={"scene_index": 0, "text": text, "locale": locale})
        assert response.status_code == 200
        result = active(response.json())
        assert result["id"] == branch_id and result["scene"]["choices"] == active(original)["scene"]["choices"]
        messages = result["npcs"]["emma"]["messages"]
        assert messages[-1]["mode"] == "scripted" and messages[-1]["locale"] == locale
        assert messages[-1]["text"].startswith(reply)
        if locale == "kk":
            assert "The greenhouse matters." in messages[-1]["text"]
    assert [message["locale"] for message in messages] == ["en", "en", "kk", "kk", "ru", "ru"]
    assert result["npcs"]["emma"]["trust"] == active(original)["npcs"]["emma"]["trust"] + 3
    assert client.post(endpoint, json={"scene_index": 0, "text": "?", "locale": "xx"}).status_code == 422


@pytest.mark.parametrize("scenario", CATALOG, ids=[scenario["id"] for scenario in CATALOG])
def test_equivalent_localized_playthroughs_have_the_same_world_endings_and_forks(game_api, scenario):
    client, _, _ = game_api
    baseline = None
    for locale, message in [("en", "Hello."), ("kk", "Сәлем."), ("ru", "Привет.")]:
        session = start(client, scenario["id"])
        trajectories = []
        for path in scenario["paths"]:
            for option in (0, 1):
                game = branch(client, session, path_id=path["id"])
                bid = game["active_id"]
                first_npc = active(game)["scene"]["npcs"][0]
                response = client.post(f"{session}/branches/{bid}/npcs/{first_npc}/messages",
                                       json={"scene_index": 0, "text": message, "locale": locale})
                assert response.status_code == 200
                game = response.json()
                steps = []
                for index in range(5):
                    current = active(game)
                    steps.append(([c["id"] for c in current["scene"]["choices"]], current["world"]))
                    game = decide(client, session, bid, index, option)
                final = active(game)
                fork = active(branch(client, session, parent_id=bid, checkpoint=2))
                assert fork["events"] == final["events"][:2]
                trajectories.append((steps, final["ending"], final["world"], fork["world"],
                                     [c["id"] for c in fork["scene"]["choices"]]))
        assert len(client.get(f"{session}/comparison").json()) == 6
        if baseline is None:
            baseline = trajectories
        else:
            assert trajectories == baseline


def provider_response(value=None, *, status="completed", refusal=False, http_status=200):
    content = [{"type": "refusal", "refusal": "Unavailable"}] if refusal else [
        {"type": "output_text", "text": json.dumps(value)}]
    return httpx.Response(http_status, request=httpx.Request("POST", story.PROVIDER_URL),
                         json={"status": status, "output": [{"type": "message", "content": content}],
                               "usage": {"input_tokens": 50, "output_tokens": 25}})


def test_scene_enhancement_validates_prose_and_leaves_state_intact(game_api, monkeypatch):
    client, _, _ = game_api
    session = start(client)
    branch_id = branch(client, session, path_id="business")["active_id"]
    initial = active(decide(client, session, branch_id, 0, 0))
    scene = initial["scene"]
    enhanced = {"title": "On the edge of a decision", "narrative": "Emma brings the pilot notes.",
                "dialogue": "Emma: Let’s check the scope.", "reaction": "Emma nods at the pilot agreement.",
                "side_event": "A neighboring shop opens for the morning."}
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    monkeypatch.setenv("PARALLEL_LIFE_AI_ENABLED", "1")
    responses = iter([provider_response({**enhanced, "choices": []}), provider_response(enhanced)])

    async def post(self, url, **kwargs):
        request = kwargs["json"]
        assert request["max_output_tokens"] == 650
        context = json.loads(request["input"])
        assert context["events"][0]["outcome"] == initial["events"][0]["outcome"]
        assert "name" not in context["profile"]
        return next(responses)

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    endpoint = f"{session}/branches/{branch_id}/scene"
    invalid = client.post(endpoint).json()
    assert "couldn’t respond" in invalid["ai_notice"]
    assert active(invalid)["scene"] == scene
    valid = active(client.post(endpoint).json())
    assert valid["scene"]["personalized"]
    assert valid["scene"]["side_event"] == enhanced["side_event"]
    assert valid["scene"]["reaction"] == enhanced["reaction"]
    assert valid["scene"]["choices"] == scene["choices"]
    assert valid["events"] == initial["events"] and valid["world"] == initial["world"]
    assert active(client.post(endpoint).json())["scene"] == valid["scene"]


def test_provider_failures_and_rate_limits_keep_chat_playable(game_api, monkeypatch, caplog):
    client, _, _ = game_api
    session = start(client)
    branch_id = branch(client, session, path_id="business")["active_id"]
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    monkeypatch.setenv("PARALLEL_LIFE_AI_ENABLED", "1")
    monkeypatch.setitem(story.POLICY, "timeout_ms", 300)
    monkeypatch.setattr(ai_limits.time, "time", lambda: 1800000000)
    calls = 0
    failures = iter([provider_response(http_status=503), provider_response(refusal=True),
                     provider_response({"reply": "Not complete"}, status="incomplete"),
                     provider_response({"reply": "a" * 721}), None, provider_response({"reply": ""})])

    async def post(self, url, **kwargs):
        nonlocal calls
        calls += 1
        response = next(failures)
        if response is None:
            await asyncio.sleep(1)
        return response

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    with caplog.at_level("INFO", logger=story.logger.name):
        for i in range(7):
            game = chat(client, session, branch_id, 0, "emma", f"Private test statement {i}")
            assert active(game)["npcs"]["emma"]["messages"][-1]["mode"] == "scripted"
            assert ("usage limit" if i == 6 else "couldn’t respond") in game["ai_notice"]
    assert calls == 6
    assert "Private test statement" not in caplog.text
    assert "result=timeout" in caplog.text and "result=http_503" in caplog.text
    assert len(active(client.get(session).json())["npcs"]["emma"]["messages"]) == 14
    monkeypatch.setenv("PARALLEL_LIFE_AI_ENABLED", "0")
    assert client.get("/api/status").json()["ai"] is False
    assert "ai_notice" not in chat(client, session, branch_id, 0, "emma", "One more scripted turn")


def test_other_self_uses_selected_timeline_and_remembers_dialogue(game_api, monkeypatch):
    import app.api.routes as routes

    client, _, _ = game_api
    url = start(client)
    left = branch(client, url, path_id="business")["active_id"]
    decide(client, url, left, 0, 0)
    right = branch(client, url, parent_id=left, checkpoint=0)["active_id"]
    decide(client, url, right, 0, 1)
    endpoint = f"{url}/branches/{left}/other-self"
    question = {"scene_index": 0, "locale": "ru", "text": "Почему ты сделал такой выбор?"}
    game = client.post(endpoint, json=question).json()
    assert game["active_id"] == right
    assert set(game["self_dialogues"]) == {left}
    first = game["self_dialogues"][left][0]
    assert first["mode"] == "scripted" and "возможный мотив" in first["reply"]
    assert client.post(endpoint, json={**question, "scene_index": 1}).status_code == 409
    assert client.post(endpoint, headers={"X-Guest-Token": str(uuid4())}, json=question).status_code == 404

    async def provider(kind, context, blocked, locale):
        assert kind == "other_self" and locale == "ru"
        assert context["selected"]["choice_id"] == "0"
        assert len(context["events"]) == 1 and context["ending"] is None
        assert context["history"] == [first]
        return {"reply": "Я хотел проверить спрос."}, None

    monkeypatch.setattr(routes, "generate", provider)
    assert client.post(endpoint, json={**question, "text": "И что дальше?"}).status_code == 200
    saved = client.get(url).json()
    assert saved["self_dialogues"][left][-1]["mode"] == "live"
    assert saved["branches"] == game["branches"]


def test_other_self_trust_choice_and_followups(game_api):
    client, _, _ = game_api
    url = start(client)
    left = branch(client, url, path_id="business")["active_id"]
    decide(client, url, left, 0, 0)
    decide(client, url, left, 1, 0)
    third = active(decide(client, url, left, 2, 2))["events"][2]
    right = branch(client, url, parent_id=left, checkpoint=2)["active_id"]
    alternate = active(decide(client, url, right, 2, 1))["events"][2]

    def ask(branch_id, question, locale="en"):
        response = client.post(f"{url}/branches/{branch_id}/other-self",
                               json={"scene_index": 2, "text": question, "locale": locale})
        assert response.status_code == 200, response.text
        return response.json()["self_dialogues"][branch_id]

    first = ask(left, "What did it lead to?")
    assert third["outcome"] in first[-1]["reply"] and "still open" in first[-1]["reply"]
    assert ask(left, "What did it lead to?") == first
    cost = ask(right, "What did it cost?")[-1]["reply"]
    assert alternate["outcome"] in cost and "finances (-4)" in cost and third["outcome"] not in cost
    assert "күнделікте жоқ" in ask(right, "Юпитер қайда?", "kk")[-1]["reply"]
    assert "не испытал" in ask(right, "Ты жалеешь об этом выборе?", "ru")[-1]["reply"]
    assert "still open" in ask(right, "What remains unknown?")[-1]["reply"]
    assert client.get(url).json()["self_dialogues"][left] == first


def test_personal_context_survives_reflection_and_reload(game_api):
    client, _, _ = game_api
    context = {"dilemma": "Keep my job or open a studio?", "constraint": "Rent is due monthly.",
               "selected_values": ["freedom", "finances"]}
    profile = {"name": "Sam", "age": 32, "avatar": "orbit", "category": "career",
               "situation": "Employed", "goal": "Explore", **context}
    for invalid in (["freedom"], ["freedom", "freedom"], ["freedom", "money"],
                    ["career", "freedom", "finances", "social"]):
        assert client.post("/api/profiles", json={**profile, "selected_values": invalid}).status_code == 422
    profile.update(gender="woman", personal_context="I share a flat in Almaty.")
    for invalid in ({"gender": "unexpected"}, {"personal_context": "x" * 301}):
        assert client.post("/api/profiles", json={**profile, **invalid}).status_code == 422
    result = client.post("/api/profiles", json=profile)
    assert result.status_code == 201
    session = client.post("/api/sessions", json={"profile_id": result.json()["id"], "scenario_id": "career"}).json()
    url = f"/api/sessions/{session['id']}"
    timeline = branch(client, url, path_id="business")["active_id"]
    reply = chat(client, url, timeline, 0, "emma", "How does my situation fit this decision?")
    assert profile["personal_context"] in active(reply)["npcs"]["emma"]["messages"][-1]["text"]
    for i in range(5):
        decide(client, url, timeline, i, 0)
    response = client.put(f"{url}/reflection", json={"priorities": ["Independence"], "dilemma": "overwritten"})
    assert response.status_code == 200
    saved = client.get(url).json()
    assert saved["profile"]["gender"] == "woman"
    assert saved["profile"]["personal_context"] == profile["personal_context"]
    for key, value in context.items():
        assert saved["passport"][key] == saved["profile"][key] == value

def test_life_priority_weights_are_validated_and_retained(game_api):
    client, _, _ = game_api
    weights = dict(skills=2, health=5, relationships=4, work=3, fulfillment=1, study=4, happiness=2)
    fields = dict(name="Avery", age=25, avatar="orbit", situation="Working", goal="Explore", category="career")
    for invalid in [{}, {**weights, "health": 0}, {**weights, "work": 6}, {**weights, "study": True},
                    {**weights, "other": 4}, {**weights, "skills": "3"}]:
        assert client.post("/api/profiles", json={**fields, "life_priorities": invalid}).status_code == 422
    profile = client.post("/api/profiles", json={**fields, "life_priorities": weights}).json()
    session = client.post("/api/sessions", json={"profile_id": profile["id"], "scenario_id": "career"}).json()
    assert client.get("/api/sessions/" + session["id"]).json()["profile"]["life_priorities"] == weights


def test_personal_story_is_owned_persistent_and_retryable(game_api, monkeypatch):
    from app.api import personal

    client, _, _ = game_api
    monkeypatch.setenv("PARALLEL_LIFE_AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setenv("PARALLEL_LIFE_AI_ENABLED", "1")
    body = {"first": "Stay at work", "second": "Take orders", "constraint": "Two evenings", "locale": "en"}
    url = "/api/personal/" + str(uuid4())
    calls = []

    async def generate(kind, brief, blocked, locale):
        calls.append(brief)
        if len(calls) == 1:
            return None, "unavailable"
        return {key: key for key in ai_limits.POLICY["outputs"]["personal"]["fields"]}, None

    monkeypatch.setattr(personal, "generate", generate)
    assert client.post(url, json={**body, "second": body["first"]}).status_code == 422
    assert client.post(url, json=body).status_code == 503
    story = client.post(url, json=body).json()
    assert client.post(url, json=body).json() == story
    assert calls == [body, body]
    assert client.put(url + "/pick/first/a").status_code == 200
    assert client.put(url + "/pick/second/b").json()["picks"] == {"first": "a", "second": "b"}
    assert client.get("/api/personal").json()[0]["story"] == story["story"]
    stranger = {"X-Guest-Token": str(uuid4())}
    assert client.get("/api/personal", headers=stranger).json() == []
    assert client.put(url + "/pick/first/b", headers=stranger).status_code == 404
