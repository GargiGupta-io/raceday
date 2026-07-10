import asyncio

import pytest
from fastapi import WebSocketDisconnect

from backend import api


class FakeWebSocket:
    def __init__(self):
        self.accepted = False
        self.sent_json = []

    async def accept(self):
        self.accepted = True

    async def send_json(self, payload):
        self.sent_json.append(payload)

    async def receive_text(self):
        raise WebSocketDisconnect()


def test_live_snapshot_treats_no_session_as_a_valid_response(monkeypatch):
    monkeypatch.setattr(api.live_feed, "get_live_state", lambda: None)

    assert api.live_snapshot() == {"active": False, "session": None}


def test_live_snapshot_preserves_the_active_live_payload(monkeypatch):
    state = {
        "session": "2026 Canadian Grand Prix",
        "lap": 25,
        "totalLaps": 70,
        "drivers": [{"code": "NOR", "position": 1}],
    }
    monkeypatch.setattr(api.live_feed, "get_live_state", lambda: state)

    assert api.live_snapshot() == {"active": True, **state}


def test_websocket_sends_current_state_and_removes_disconnected_client(monkeypatch):
    state = {
        "session": "2026 Canadian Grand Prix",
        "lap": 25,
        "totalLaps": 70,
        "drivers": [],
    }
    client_events = []
    socket = FakeWebSocket()

    monkeypatch.setattr(api.live_feed, "get_live_state", lambda: state)
    monkeypatch.setattr(api.live_feed, "add_client", lambda ws: client_events.append(("add", ws)))
    monkeypatch.setattr(api.live_feed, "remove_client", lambda ws: client_events.append(("remove", ws)))

    asyncio.run(api.websocket_live(socket))

    assert socket.accepted is True
    assert socket.sent_json == [state]
    assert client_events == [("add", socket), ("remove", socket)]


@pytest.mark.asyncio
async def test_companion_endpoint_preserves_the_extension_response_contract(monkeypatch):
    expected = {
        "ok": True,
        "mode": "replay",
        "label": "Pit pressure",
        "headline": "Stopping first could decide who controls this fight.",
        "notes": [
            "Fresh tyres can create an advantage before the rival responds.",
            "Traffic after the stop determines whether that advantage survives.",
        ],
        "source": "race-context",
    }

    async def build_note(*args, **kwargs):
        return expected

    monkeypatch.setattr(api.companion, "build_companion_note_with_ai", build_note)

    payload = api.CompanionNoteRequest(
        title="Race Highlights | 2026 Canadian Grand Prix",
        year=2026,
        raceName="Canadian Grand Prix",
        currentTime=160,
        duration=490,
        mode="replay",
    )

    assert await api.companion_note(payload) == expected


@pytest.mark.asyncio
async def test_lifespan_owns_the_shared_upstream_client(monkeypatch):
    events = []

    class FakeThread:
        def start(self):
            events.append("index-thread-start")

    async def start_http():
        events.append("http-start")

    async def stop_http():
        events.append("http-stop")

    async def start_live():
        events.append("live-start")

    async def stop_live():
        events.append("live-stop")

    async def start_cache():
        events.append("cache-start")

    async def stop_cache():
        events.append("cache-stop")

    monkeypatch.setattr(api.cache, "start_runtime_cache", start_cache)
    monkeypatch.setattr(api.cache, "stop_runtime_cache", stop_cache)
    monkeypatch.setattr(api.http_client, "start_upstream_client", start_http)
    monkeypatch.setattr(api.http_client, "stop_upstream_client", stop_http)
    monkeypatch.setattr(api, "_use_prebuilt_index_if_available", lambda: True)
    monkeypatch.setattr(api.threading, "Thread", lambda **kwargs: FakeThread())
    monkeypatch.setattr(api.live_feed, "start_feed", start_live)
    monkeypatch.setattr(api.live_feed, "stop_feed", stop_live)

    async with api.lifespan(api.app):
        assert events == [
            "cache-start",
            "http-start",
            "index-thread-start",
            "live-start",
        ]

    assert events == [
        "cache-start",
        "http-start",
        "index-thread-start",
        "live-start",
        "live-stop",
        "http-stop",
        "cache-stop",
    ]
