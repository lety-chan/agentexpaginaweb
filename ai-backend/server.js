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
    'X-Title': 'Deepeer Almacen AI',
  },
});

const mcpClient = new Client(
  { name: 'deepper-express-client', version: '1.0.0' },
  { capabilities: {} }
);

let openRouterTools = [];

async function initMCP() {
  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['-y', '@benborla29/mcp-server-mysql'],
    env: {
      ...process.env,
      MYSQL_HOST: process.env.MYSQL_HOST || 'localhost',
      MYSQL_PORT: process.env.MYSQL_PORT || '3306',
      MYSQL_USER: process.env.MYSQL_USER || 'root',
      MYSQL_PASS: process.env.MYSQL_PASS || '',
      MYSQL_DB: process.env.MYSQL_DB || 'deepper',
    },
  });

  await mcpClient.connect(transport);
  console.log('Conectado al servidor MCP de MySQL (deepper)');

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

  console.log('Herramientas cargadas:', openRouterTools.map((t) => t.function.name));
}

// Endpoint de Chat conectado a las herramientas de MySQL
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    const systemPrompt = {
      role: 'system',
      content: `Eres un asistente experto de almacén conectado EXCLUSIVAMENTE a la base de datos MySQL "deepper".
        TIENES PROHIBIDO responder con conocimiento general, inventar cifras o darle la razón al usuario sin verificar antes en la base de datos. tienes que ser amable y servicial con el usuario

        ESTRUCTURA REAL DE LA BASE DE DATOS:
        - categorias (id, nombre, descripcion, created_at)
        - productos (id, categoria_id, lote_id, nombre, sku, descripcion, precio, estado, created_at, updated_at)
        - inventario (id, producto_id, cantidad, stock_minimo, updated_at)
        - lotes (id, codigo_lote, descripcion, fecha_ingreso, fecha_caducidad, created_at)
        - movimientos (id, almacen_id, usuario_id, tipo ['entrada','salida','ajuste','merma'], cantidad, notas, fecha) -- Nota: almacen_id se une con inventario.id
        - usuarios (id, nombre, email, rol, created_at, updated_at)
        - chat_interacciones (id, usuario_id, movimiento_id, mensaje_usuario, respuesta_ia, created_at)

        REGLAS DE CONSULTA SQL (OBLIGATORIAS):
        1. Cuando pregunten por productos con "más salidas", "más movimiento de salida", "más vendidos" o "mayor entrada/merma", calcula SIEMPRE el total de unidades usando SUM(m.cantidad) (no COUNT), uniendo productos -> inventario -> movimientos.
        2. Si el usuario te corrige o cuestiona un dato, EJECUTA una nueva consulta SQL para comprobarlo antes de responder.
        3. Búsquedas flexibles: Usa siempre LOWER() y LIKE con comodines (%) ignorando tildes (ej. LOWER(p.nombre) LIKE '%bol%grafo%').

        FORMATO DE SALIDA (ESTRICTAMENTE HTML, CERO MARKDOWN):
        - PROHIBIDO usar asteriscos (**), almohadillas (###) o guiones de lista.
        - Usa únicamente etiquetas HTML (<p>, <strong>, <table class="tabla-bot">).
        - Si es un solo resultado, redacta una respuesta natural con <strong>. Ejemplo:
          <p>El producto con mayor movimiento de salida es la <strong>Cinta de empaque</strong> (SKU: EMB-CIN-48), con un total de <strong>25 unidades</strong> retiradas.</p>
        - Si son 2 o más resultados, usa siempre <table class="tabla-bot"> con <thead> y <tbody>.`
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

        console.log(`Ejecutando herramienta [${toolName}]:`, toolArgs);

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
      console.log(`Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error al iniciar MCP:', err);
  });