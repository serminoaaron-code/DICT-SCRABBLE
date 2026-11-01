// Big-screen standings for a projector: ?view=scoreboard. Read-only, no password.
(function (root) {
  'use strict';

  const esc = s => UI.escapeHtml(s);
  const LIVE = ['live', 'paused', 'appeal', 'suddenDeath', 'hostDecision'];

  function show(el) {
    el.innerHTML = `
      <h1 class="big-title">🏆 DICT Scrabble · Team Standings</h1>
      <div class="big-grid">
        <section><table class="big"><thead><tr><th>#</th><th>Team</th><th>W-L</th><th>Pts</th></tr></thead><tbody id="bigStand"></tbody></table></section>
        <section><h2 class="big-title" style="font-size:30px;">● Live rooms</h2><div id="bigLive"></div></section>
      </div>
      <div class="big-recent" id="bigRecent"></div>`;
    const state = { teams: {}, rooms: {} };
    const nameOf = (room, seat) => {
      const id = seat === 'A' ? room.teamA : room.teamB;
      return (state.teams[id] && state.teams[id].name) || (seat === 'A' ? room.teamAName : room.teamBName);
    };
    const clockOf = room => {
      const phase = Match.roomPhase(room);
      if (phase === 'suddenDeath') return 'SUDDEN DEATH';
      if (phase === 'hostDecision') return 'HOST DECISION';
      if (phase === 'paused') return 'PAUSED';
      const ms = room.clock.paused ? room.clock.paused.matchRemainingMs : room.clock.endsAt - Store.serverNow();
      return UI.formatClock(ms);
    };

    function render() {
      const standings = Match.computeStandings(state.teams, state.rooms);
      el.querySelector('#bigStand').innerHTML = standings.map(t => `<tr>
        <td>${t.rank}</td><td>${esc(t.name)}</td><td>${t.wins}-${t.losses}</td><td class="pts">${t.points}</td></tr>`).join('')
        || '<tr><td colspan="4">No teams yet</td></tr>';

      const rooms = Object.values(state.rooms);
      const live = rooms.filter(r => LIVE.includes(Match.roomPhase(r)) && r.game);
      el.querySelector('#bigLive').innerHTML = live.map(r => `<div class="big-room">
          <div>${esc(nameOf(r, 'A'))} <b>${r.game.scores.A}</b> – <b>${r.game.scores.B}</b> ${esc(nameOf(r, 'B'))}</div>
          <div class="clk" data-bigclock="${esc(r.code)}">${esc(clockOf(r))}</div>
        </div>`).join('') || '<div style="color:#d6c3a0;">No games in progress</div>';

      const recent = rooms.filter(r => r.status === 'final' && r.result)
        .sort((a, b) => b.result.decidedAt - a.result.decidedAt).slice(0, 5);
      el.querySelector('#bigRecent').innerHTML = recent.length
        ? 'Latest: ' + recent.map(r => `+1 ${esc(nameOf(r, r.result.winner))} (${r.result.scoreA}–${r.result.scoreB})`).join(' · ')
        : '';
    }

    const u1 = Store.watchTeams(t => { state.teams = t; render(); });
    const u2 = Store.watchRooms(r => { state.rooms = r; render(); });
    App.onTick(() => {
      el.querySelectorAll('[data-bigclock]').forEach(n => {
        const room = state.rooms[n.dataset.bigclock];
        if (room && room.clock) n.textContent = clockOf(room);
      });
    });
    return () => { u1(); u2(); };
  }

  root.ScoreboardView = { show };
})(window);
