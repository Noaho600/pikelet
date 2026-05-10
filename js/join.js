const form = document.getElementById("joinForm");
const input = document.getElementById("code");
const status = document.getElementById("joinStatus");

input.addEventListener("input", () => {
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = input.value.trim();
  if (code.length !== 6) {
    status.hidden = false;
    status.textContent = "Codes are 6 characters.";
    return;
  }
  status.hidden = false;
  status.textContent = `Welcome to room ${code}. (Real-time play comes next.)`;
});
