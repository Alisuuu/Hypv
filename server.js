// Carrega variáveis de ambiente do arquivo .env
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws'); // Importa o módulo WebSocket
const http = require('http'); // Importa o módulo HTTP para integrar o WebSocket

const app = express();
const PORT = process.env.PORT || 3001; // Porta do servidor, padrão 3001

// Sua chave de API Hyperbeam (OBTENHA DO .env)
const HYPERBEAM_API_KEY = process.env.HYPERBEAM_API_KEY;
const HYPERBEAM_API_URL = 'https://api.hyperbeam.com/v0';

// Verifica se a chave API está configurada
if (!HYPERBEAM_API_KEY) {
  console.error('ERRO: HYPERBEAM_API_KEY não definida no arquivo .env');
  process.exit(1); // Encerra o processo se a chave não estiver presente
}

// Middleware para analisar JSON e habilitar CORS
app.use(express.json());
app.use(cors()); // Permite requisições de diferentes origens (seu frontend)

// Cria um servidor HTTP para que o WebSocket possa ser anexado a ele
const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // Cria um servidor WebSocket anexado ao servidor HTTP

// Armazenamento temporário para sessões Hyperbeam ativas
// Em uma aplicação real, você usaria um banco de dados (ex: Firestore, MongoDB)
let activeHyperbeamSession = null; // { sessionId: '...', embedUrl: '...' }

// Armazenamento para clientes WebSocket conectados
const clients = new Set();

// Lógica do WebSocket
wss.on('connection', ws => {
  clients.add(ws); // Adiciona o novo cliente ao conjunto de clientes conectados
  console.log('Cliente WebSocket conectado.');

  // Envia o estado atual da sessão Hyperbeam para o novo cliente
  if (activeHyperbeamSession) {
    ws.send(JSON.stringify({ type: 'session_info', data: activeHyperbeamSession }));
  }

  ws.on('message', message => {
    try {
      const parsedMessage = JSON.parse(message);
      console.log('Mensagem WebSocket recebida:', parsedMessage);

      // Lida com diferentes tipos de mensagens
      switch (parsedMessage.type) {
        case 'chat_message':
          // Reenvia a mensagem de chat para todos os clientes conectados
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'chat_message', data: parsedMessage.data }));
            }
          });
          break;
        case 'mouse_position':
          // Reenvia a posição do mouse para todos os clientes conectados (exceto o remetente, opcional)
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) { // Opcional: não enviar de volta para o remetente
              client.send(JSON.stringify({ type: 'mouse_position', data: parsedMessage.data }));
            }
          });
          break;
        // Adicione outros tipos de mensagens conforme necessário (ex: controle de vídeo)
      }
    } catch (error) {
      console.error('Erro ao analisar mensagem WebSocket:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws); // Remove o cliente quando a conexão é fechada
    console.log('Cliente WebSocket desconectado.');
  });

  ws.on('error', error => {
    console.error('Erro no WebSocket:', error);
  });
});

// Endpoint para criar uma nova sessão Hyperbeam
app.post('/api/create-session', async (req, res) => {
  console.log('Recebida requisição para criar sessão Hyperbeam.');
  try {
    // Se já houver uma sessão ativa, destrua-a primeiro (opcional, dependendo da lógica do seu app)
    if (activeHyperbeamSession) {
      console.log(`Destruindo sessão existente: ${activeHyperbeamSession.sessionId}`);
      await axios.delete(`${HYPERBEAM_API_URL}/vm/${activeHyperbeamSession.sessionId}`, {
        headers: { Authorization: `Bearer ${HYPERBEAM_API_KEY}` }
      });
      activeHyperbeamSession = null;
    }

    // Cria uma nova VM Hyperbeam
    const response = await axios.post(`${HYPERBEAM_API_URL}/vm`, {
      // Configurações da VM (ajuste conforme necessário)
      // Consulte a documentação da API Hyperbeam para opções de configuração
      // Exemplo: start_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      // Exemplo: region: 'us-east-1'
    }, {
      headers: { Authorization: `Bearer ${HYPERBEAM_API_KEY}` }
    });

    const { vmId, embedUrl } = response.data;
    activeHyperbeamSession = { sessionId: vmId, embedUrl };

    console.log('Sessão Hyperbeam criada:', activeHyperbeamSession);

    // Envia a nova URL da sessão para todos os clientes WebSocket
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'session_info', data: activeHyperbeamSession }));
      }
    });

    res.json({ success: true, sessionId: vmId, embedUrl });
  } catch (error) {
    console.error('Erro ao criar sessão Hyperbeam:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, error: 'Falha ao criar sessão Hyperbeam.' });
  }
});

// Endpoint para destruir uma sessão Hyperbeam
app.post('/api/destroy-session', async (req, res) => {
  console.log('Recebida requisição para destruir sessão Hyperbeam.');
  const { sessionId } = req.body; // Espera que o frontend envie o sessionId a ser destruído

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'ID da sessão é necessário.' });
  }

  try {
    await axios.delete(`${HYPERBEAM_API_URL}/vm/${sessionId}`, {
      headers: { Authorization: `Bearer ${HYPERBEAM_API_KEY}` }
    });

    // Limpa a sessão ativa se a sessão destruída for a que estava ativa
    if (activeHyperbeamSession && activeHyperbeamSession.sessionId === sessionId) {
      activeHyperbeamSession = null;
      // Notifica os clientes WebSocket que a sessão foi destruída
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'session_destroyed' }));
        }
      });
    }

    console.log(`Sessão Hyperbeam ${sessionId} destruída com sucesso.`);
    res.json({ success: true, message: `Sessão ${sessionId} destruída.` });
  } catch (error) {
    console.error('Erro ao destruir sessão Hyperbeam:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, error: 'Falha ao destruir sessão Hyperbeam.' });
  }
});

// Inicia o servidor HTTP (onde o Express e o WebSocket estão rodando)
server.listen(PORT, () => {
  console.log(`Servidor backend rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
});

