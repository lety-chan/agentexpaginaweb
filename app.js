let conversationHistory = [];

async function sendMessage() {
  const inputField = document.getElementById('userInput');
  const chatBox = document.getElementById('chatBox');
  const text = inputField.value.trim();

  if (!text) return;

  // 1. Mostrar mensaje del usuario en la UI
  appendMessage(text, 'user');
  inputField.value = '';
  chatBox.scrollTop = chatBox.scrollHeight;

  // Agregar al historial local
  conversationHistory.push({ role: 'user', content: text });

  const loadingIndicator = appendLoadingIndicator();
  try {
    // 2. Enviar petición al Backend
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: conversationHistory.slice(0, -1) // Enviamos el historial previo
      })
    });

    const data = await response.json();

    if (data.reply) {
      // 3. Mostrar respuesta del agente en la UI
      appendMessage(data.reply, 'assistant');
      // Agregar respuesta al historial local
      conversationHistory.push({ role: 'assistant', content: data.reply });
    } else {
      appendMessage('Error: No se pudo obtener respuesta del servidor.', 'assistant');
    }
  } catch (error) {
    console.error('Error de red:', error);
    appendMessage('Error de conexión con el servidor.', 'assistant');
  } finally {
    loadingIndicator.remove();
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

function appendLoadingIndicator() {
  const chatBox = document.getElementById('chatBox');
  const indicator = document.createElement('div');
  indicator.className = 'message assistant loading';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-label', 'El asistente está escribiendo');
  indicator.innerHTML = '<span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span><span class="visually-hidden">El asistente está escribiendo...</span>';
  chatBox.appendChild(indicator);
  chatBox.scrollTop = chatBox.scrollHeight;
  return indicator;
}

function appendMessage(text, sender) {
  const chatBox = document.getElementById('chatBox');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;
  messageDiv.textContent = text;
  chatBox.appendChild(messageDiv);
}

function handleKeyPress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}