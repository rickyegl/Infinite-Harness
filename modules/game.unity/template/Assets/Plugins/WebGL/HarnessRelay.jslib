// Crossplay relay for the browser build: one WebSocket to the bridge's /relay room.
// Incoming messages queue up in JS; C# drains them each frame with RelayPoll.
mergeInto(LibraryManager.library, {
  RelayOpen: function (urlPtr) {
    var url = UTF8ToString(urlPtr);
    if (url.indexOf("ws") !== 0) {
      var loc = window.location;
      url = (loc.protocol === "https:" ? "wss://" : "ws://") + loc.host + (url.charAt(0) === "/" ? "" : "/") + url;
    }
    if (window.__relay) { try { window.__relay.close(); } catch (e) {} }
    window.__relayQ = [];
    var ws = new WebSocket(url);
    ws.onmessage = function (e) { if (window.__relayQ.length < 512) window.__relayQ.push(String(e.data)); };
    ws.onclose = function () { window.__relayOpen = 0; };
    ws.onopen = function () { window.__relayOpen = 1; };
    window.__relay = ws;
  },
  RelaySend: function (msgPtr) {
    var ws = window.__relay;
    if (ws && ws.readyState === 1) ws.send(UTF8ToString(msgPtr));
  },
  RelayState: function () {
    var ws = window.__relay;
    return ws ? ws.readyState : 3;
  },
  RelayPoll: function () {
    var q = window.__relayQ || [];
    var s = q.length ? q.join("\n") : "";
    window.__relayQ = [];
    var n = lengthBytesUTF8(s) + 1;
    var p = _malloc(n);
    stringToUTF8(s, p, n);
    return p;
  },
  RelayClose: function () {
    if (window.__relay) { try { window.__relay.close(); } catch (e) {} window.__relay = null; }
  }
});
