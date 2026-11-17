const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { OpenAI } = require('openai');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const app = express();
app.use(express.json());
app.use(cors());

// 1. Inicializar OpenRouter
const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://tu-sitio-web.com',
    'X-Title': 'Mi Aplicativo Web',
  },
});

const mcpClient = new Client(
  { name: 'sakila-express-client', version: '1.0.0' },
  { capabilities: {} }
);

let openRouterTools = [];

async function initMCP() {
  const transport = new StdioClientTransport({
    command: 'npx.cmd',
    args: ['-y', '@benborla29/mcp-server-mysql'],
    env: {
      ...process.env,
      MYSQL_HOST: process.env.MYSQL_HOST || 'localhost',
      MYSQL_PORT: process.env.MYSQL_PORT || '3306',
      MYSQL_USER: process.env.MYSQL_USER || 'root',
      MYSQL_PASS: process.env.MYSQL_PASS || '',
      MYSQL_DB: process.env.MYSQL_DB || 'sakila',
    },
  });

  await mcpClient.connect(transport);
  console.log('Conectado al servidor MCP de MySQL (Sakila)');

  // Obtener las herramientas de MySQL
  const mcpToolsList = await mcpClient.listTools();
  openRouterTools = mcpToolsList.tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));

  console.log(' Herramientas cargadas:', openRouterTools.map((t) => t.function.name));
}

// Endpoint de Chat conectado a las herramientas de Sakila
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    const systemPrompt = {
      role: 'system',
      content:
        'Eres un agente de base de datos conectado EXCLUSIVAMENTE a la base de datos MySQL "sakila" (tienda de renta de películas). TIENES PROHIBIDO responder con conocimiento general o inventar películas, clientes o cifras. Para CUALQUIER pregunta, DEBES usar tus herramientas SQL para consultar las tablas reales de Sakila primero y responder únicamente con los resultados obtenidos de la base de datos.',
    };

    const messages = [
      systemPrompt,
      ...(history || []),
      { role: 'user', content: message },
    ];

    // Enviar mensajes + herramientas disponibles a OpenRouter
    let completion = await openrouter.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: messages,
      tools: openRouterTools,
      tool_choice: 'auto',
    });

    let responseMessage = completion.choices[0].message;

    // Bucle para ejecutar todas las consultas SQL que la IA necesite hacer
    while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      messages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(` Ejecutando herramienta [${toolName}]:`, toolArgs);

        const mcpResult = await mcpClient.callTool({
          name: toolName,
          arguments: toolArgs,
        });

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(mcpResult.content),
        });
      }

      // Volver a consultar a OpenRouter con los datos reales que devolvió MySQL
      completion = await openrouter.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: messages,
        tools: openRouterTools,
      });

      responseMessage = completion.choices[0].message;
    }

    res.json({ reply: responseMessage.content });
  } catch (error) {
    console.error('Error al comunicarse con OpenRouter/MCP:', error);
    res.status(500).json({ error: 'Error interno al procesar la solicitud con la IA' });
  }
});

const PORT = process.env.PORT || 3000;

// Conectar primero a MCP y luego encender el servidor Express
initMCP()
  .then(() => {
    app.listen(PORT, () => {
      console.log(` Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error(' Error al iniciar MCP:', err);
  });