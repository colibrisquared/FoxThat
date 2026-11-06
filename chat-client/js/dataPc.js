const clockEl = document.getElementById("clock");
const ramEl = document.getElementById("ram");

function updateClock() {
  clockEl.textContent = new Date().toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
  });
}

async function updateRam() {
  try {
    const res = await fetch("http://127.0.0.1:3001");
    const { used, total } = await res.json();
    const gb = (n) => (n / 1024 ** 3).toFixed(1);
    ramEl.textContent = `${gb(used)} / ${gb(total)} Go (${Math.round((used / total) * 100)}%)`;
  } catch {
    ramEl.textContent = "serveur injoignable";
  }
}

updateClock();
updateRam();
setInterval(updateClock, 1000);
setInterval(updateRam, 2000);