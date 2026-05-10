const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode() {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

const el = document.getElementById("gameCode");
const newBtn = document.getElementById("newCode");
const copyBtn = document.getElementById("copyCode");
const status = document.getElementById("copyStatus");

function showCode() {
  el.textContent = randomCode();
}

newBtn.addEventListener("click", showCode);

copyBtn.addEventListener("click", async () => {
  const text = el.textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
    status.hidden = false;
    status.textContent = "Copied to clipboard.";
    window.setTimeout(() => {
      status.hidden = true;
    }, 2000);
  } catch {
    status.hidden = false;
    status.textContent = "Select the code and copy manually.";
    window.setTimeout(() => {
      status.hidden = true;
    }, 3000);
  }
});

showCode();
