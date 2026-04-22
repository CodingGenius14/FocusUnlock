async function loadSessions() {
  const status = document.getElementById("stats-status");
  const list = document.getElementById("sessions-list");
  if (!list || !status) return;

  list.innerHTML = "";

  try {
    const response = await fetch("http://localhost:3000/sessions");
    if (!response.ok) throw new Error("Failed to load sessions");

    const sessions = await response.json();
    if (!Array.isArray(sessions) || sessions.length === 0) {
      status.textContent = "No sessions saved yet.";
      return;
    }

    status.textContent = `${sessions.length} session(s)`;
    sessions.forEach((session) => {
      const item = document.createElement("li");
      const date = new Date(session.timestamp).toLocaleString();
      item.textContent = `${session.site} - ${session.duration_minutes} min - ${date}`;
      list.appendChild(item);
    });
  } catch (error) {
    status.textContent = "Backend unavailable. Start FastAPI server to view saved sessions.";
  }
}

loadSessions();
