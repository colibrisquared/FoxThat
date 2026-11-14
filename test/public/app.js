const result = document.getElementById("result");

async function load() {
  result.textContent = "Chargement…";
  try {
    const res = await fetch("/api/hello");
    const data = await res.json();
    result.textContent = `${data.message} (${new Date(data.date).toLocaleTimeString("fr-FR")})`;
  } catch {
    result.textContent = "Erreur de connexion au serveur.";
  }
}

document.getElementById("reload").addEventListener("click", load);
load();