const rollButton = document.getElementById("rollButton");
const result = document.getElementById("result");
const message = document.getElementById("message");
const historyList = document.getElementById("history");

function rollD20() {
  const value = Math.floor(Math.random() * 20) + 1;
  result.textContent = value;

  if (value === 20) {
    message.textContent = "Critical Hit! ✨";
  } else if (value === 1) {
    message.textContent = "Critical Fail... 💀";
  } else {
    message.textContent = `You rolled a ${value}.`;
  }

  const item = document.createElement("li");
  item.textContent = `Rolled: ${value}`;
  historyList.prepend(item);

  if (historyList.children.length > 5) {
    historyList.removeChild(historyList.lastChild);
  }
}

rollButton.addEventListener("click", rollD20);
