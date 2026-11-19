let conversationHistory = [];

// Cambiar entre la vista de Chat y la vista de Dashboard
function switchView(viewName) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));

  if (viewName === 'dashboard') {
    document.getElementById('view-dashboard').classList.add('active');
    document.getElementById('nav-dashboard').classList.add('active');
  } else {
    document.getElementById('view-chat').classList.add('active');
    document.getElementById('nav-chat').classList.add('active');
  }
}

// Enviar una consulta rápida desde los chips o botones del dashboard
function sendQuickPrompt(promptText) {
  const inputField = document.getElementById('userInput');
  inputField.value = promptText;
  sendMessage();
}

// Saltar desde una alerta del dashboard directo al chat con la pregunta
function askFromAlert(promptText) {
  switchView('chat');
  sendQuickPrompt(promptText);
}

// Limpiar el historial visual y de memoria
function clearChat() {
  conversationHistory = [];
  const chatBox = document.getElementById('chatBox');
  chatBox.innerHTML = `
    <div class="date-pill">Hoy</div>
    <div class="message assistant">
      <p>Historial limpiado. ¿Qué deseas consultar ahora en el almacén?</p>
    </div>
  `;
}

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
        history: conversationHistory.slice(0, -1),
      }),
    });

    const data = await response.json();

    if (data.reply) {
      // 3. Mostrar respuesta del agente en la UI
      appendMessage(data.reply, 'assistant');
      conversationHistory.push({ role: 'assistant', content: data.reply });
    } else {
      appendMessage('Error: No se pudo obtener respuesta del servidor.', 'assistant');
    }
  } catch (error) {
    console.error('Error de red:', error);
    appendMessage('Error de conexión con el servidor (verifica que node server.js esté encendido).', 'assistant');
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
  indicator.innerHTML = `
    <span class="loading-dot"></span>
    <span class="loading-dot"></span>
    <span class="loading-dot"></span>
    <span class="visually-hidden">El asistente está escribiendo...</span>
  `;
  chatBox.appendChild(indicator);
  chatBox.scrollTop = chatBox.scrollHeight;
  return indicator;
}

function appendMessage(text, sender) {
  const chatBox = document.getElementById('chatBox');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;

  if (sender === 'assistant') {
    const cleanHtml = text
      .replace(/```html|```/g, '')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    messageDiv.innerHTML = cleanHtml;
  } else {
    messageDiv.textContent = text;
  }

  chatBox.appendChild(messageDiv);
}

function handleKeyPress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}