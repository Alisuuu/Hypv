import React, { useState, useEffect, useRef } from 'react';

// URL do seu servidor backend
const BACKEND_URL = 'http://localhost:3001'; // Altere para a URL do seu backend em produção
const WEBSOCKET_URL = 'ws://localhost:3001'; // Altere para a URL do seu WebSocket em produção

// Main App component
function App() {
  const [hyperbeamSessionUrl, setHyperbeamSessionUrl] = useState('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const chatContainerRef = useRef(null);
  const ws = useRef(null); // Ref para a conexão WebSocket

  // Efeito para lidar com a conexão WebSocket e mensagens recebidas
  useEffect(() => {
    // Inicializa a conexão WebSocket
    ws.current = new WebSocket(WEBSOCKET_URL);

    ws.current.onopen = () => {
      console.log('Conectado ao servidor WebSocket.');
      setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Conectado ao chat.' }]);
    };

    ws.current.onmessage = event => {
      try {
        const parsedMessage = JSON.parse(event.data);
        switch (parsedMessage.type) {
          case 'chat_message':
            setChatMessages(prev => [...prev, parsedMessage.data]);
            break;
          case 'mouse_position':
            // Atualiza a posição do mouse de outros usuários (opcional: renderizar cursores remotos)
            // Por simplicidade, este exemplo apenas loga a posição remota
            // console.log('Mouse remoto:', parsedMessage.data);
            break;
          case 'session_info':
            // Recebe informações da sessão Hyperbeam do backend
            setHyperbeamSessionUrl(parsedMessage.data.embedUrl);
            setIsSessionActive(true);
            setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Sessão Hyperbeam carregada.' }]);
            break;
          case 'session_destroyed':
            setHyperbeamSessionUrl('');
            setIsSessionActive(false);
            setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Sessão Hyperbeam encerrada.' }]);
            break;
          default:
            console.log('Mensagem WebSocket desconhecida:', parsedMessage);
        }
      } catch (error) {
        console.error('Erro ao analisar mensagem WebSocket:', error);
      }
    };

    ws.current.onclose = () => {
      console.log('Desconectado do servidor WebSocket.');
      setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Desconectado do chat.' }]);
    };

    ws.current.onerror = error => {
      console.error('Erro no WebSocket:', error);
      setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Erro na conexão do chat.' }]);
    };

    // Limpeza: fecha a conexão WebSocket quando o componente é desmontado
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []); // Executa apenas uma vez na montagem do componente

  // Effect to handle mouse movement for simulation and sending to backend
  useEffect(() => {
    const handleMouseMove = (event) => {
      const newMousePosition = { x: event.clientX, y: event.clientY };
      setMousePosition(newMousePosition);
      // Envia a posição do mouse para o backend via WebSocket
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'mouse_position', data: newMousePosition }));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Effect to scroll to the bottom of the chat when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Function to start a Hyperbeam session via backend API
  const startSession = async () => {
    console.log('Iniciando sessão Hyperbeam via backend...');
    try {
      const response = await fetch(`${BACKEND_URL}/api/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        // A URL da sessão será recebida via WebSocket no onmessage 'session_info'
        setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Requisição de sessão enviada.' }]);
      } else {
        console.error('Falha ao iniciar sessão:', data.error);
        setChatMessages(prev => [...prev, { sender: 'Sistema', message: `Erro ao iniciar sessão: ${data.error}` }]);
      }
    } catch (error) {
      console.error('Erro de rede ao iniciar sessão:', error);
      setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Erro de rede ao iniciar sessão.' }]);
    }
  };

  // Function to destroy the Hyperbeam VM via backend API
  const destroyVm = async () => {
    console.log('Destruindo VM Hyperbeam via backend...');
    if (!hyperbeamSessionUrl) {
      setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Nenhuma sessão ativa para destruir.' }]);
      return;
    }
    // Extrai o sessionId da URL para enviar ao backend
    const sessionId = hyperbeamSessionUrl.split('/').pop(); // Isso pode variar dependendo do formato da URL da Hyperbeam
    if (!sessionId) {
      setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Não foi possível obter o ID da sessão para destruir.' }]);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/destroy-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        // O estado da sessão será atualizado via WebSocket no onmessage 'session_destroyed'
        setChatMessages(prev => [...prev, { sender: 'Sistema', message: `Requisição para destruir sessão ${sessionId} enviada.` }]);
      } else {
        console.error('Falha ao destruir VM:', data.error);
        setChatMessages(prev => [...prev, { sender: 'Sistema', message: `Erro ao destruir VM: ${data.error}` }]);
      }
    } catch (error) {
      console.error('Erro de rede ao destruir VM:', error);
      setChatMessages(prev => [...prev, { sender: 'Sistema', message: 'Erro de rede ao destruir VM.' }]);
    }
  };

  // Function to handle sending a chat message via WebSocket
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (currentChatMessage.trim() && ws.current && ws.current.readyState === WebSocket.OPEN) {
      const messageToSend = { sender: 'Você', message: currentChatMessage };
      ws.current.send(JSON.stringify({ type: 'chat_message', data: messageToSend }));
      setCurrentChatMessage('');
    }
  };

  // Helper to get sender's initial for avatar
  const getSenderInitial = (sender) => sender.charAt(0).toUpperCase();

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col font-inter antialiased overflow-hidden">
      <header className="shadow-lg rounded-b-xl" style={{ background: 'linear-gradient(to right, #6A0DAD, #B088F9)' }}>
        {/* No title or content here for a truly minimal header */}
      </header>

      <main className="flex-grow flex flex-col lg:flex-row gap-0 overflow-hidden">
        <section className="flex-grow lg:flex-[2] bg-gray-900 rounded-xl shadow-lg p-2 flex flex-col m-1">
          <h2 className="text-xl font-semibold text-gray-200 mb-2">Sessão de Visualização</h2>
          {!isSessionActive ? (
            <div className="flex flex-col items-center justify-center flex-grow space-y-3">
              <p className="text-gray-400 text-center text-sm">
                Clique em "Iniciar Sessão" para começar sua festa de exibição.
              </p>
              <button
                onClick={startSession}
                className="bg-[#B088F9] hover:bg-[#C7A2FF] text-white font-bold py-2 px-4 rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#B088F9] focus:ring-opacity-75 text-sm"
              >
                🚀 Iniciar Sessão
              </button>
            </div>
          ) : (
            <>
              <div className="w-full flex-grow bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center relative">
                {hyperbeamSessionUrl ? (
                  <iframe
                    src={hyperbeamSessionUrl}
                    allow="clipboard-read; clipboard-write; fullscreen; autoplay"
                    className="w-full h-full border-0"
                    title="Hyperbeam Session"
                  ></iframe>
                ) : (
                  <p className="text-gray-400 text-sm">Carregando sessão Hyperbeam...</p>
                )}
                <div className="absolute top-1 left-1 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 rounded-md">
                  Mouse: X: {mousePosition.x}, Y: {mousePosition.y} (simulado)
                </div>
              </div>
              <button
                onClick={destroyVm}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75 mt-2 text-sm"
              >
                🛑 Destruir VM
              </button>
            </>
          )}
        </section>

        <section className="flex-grow lg:flex-[1] bg-gray-900 rounded-xl shadow-lg p-2 flex flex-col m-1">
          <h2 className="text-xl font-semibold text-gray-200 mb-2">Chat da Festa</h2>
          <div
            ref={chatContainerRef}
            className="flex-grow border border-gray-700 rounded-lg p-2 mb-2 overflow-y-auto bg-gray-800"
          >
            {chatMessages.length === 0 ? (
              <p className="text-gray-500 text-center text-sm">Nenhuma mensagem ainda. Diga olá!</p>
            ) : (
              chatMessages.map((msg, index) => (
                <div key={index} className={`flex items-start mb-1.5 ${msg.sender === 'Você' ? 'justify-end' : 'justify-start'}`}>
                  {msg.sender !== 'Você' && (
                    <div className="w-7 h-7 rounded-full bg-purple-700 flex items-center justify-center text-white text-xs font-bold mr-1.5 flex-shrink-0">
                      {getSenderInitial(msg.sender)}
                    </div>
                  )}
                  <div className={`max-w-[80%] p-2 rounded-lg ${msg.sender === 'Você' ? 'bg-[#B088F9] text-white ml-auto' : 'bg-gray-700 text-gray-200 mr-auto'}`}>
                    <span className="font-semibold text-xs opacity-80 block mb-0.5">
                      {msg.sender === 'Você' ? 'Você' : msg.sender}
                    </span>
                    <span className="text-sm">{msg.message}</span>
                  </div>
                  {msg.sender === 'Você' && (
                    <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold ml-1.5 flex-shrink-0">
                      {getSenderInitial(msg.sender)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendMessage} className="flex space-x-1.5">
            <input
              type="text"
              value={currentChatMessage}
              onChange={(e) => setCurrentChatMessage(e.target.value)}
              placeholder="Digite sua mensagem..."
              className="flex-grow p-2.5 text-sm border border-gray-700 rounded-lg bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#B088F9]"
            />
            <button
              type="submit"
              className="bg-[#B088F9] hover:bg-[#C7A2FF] text-white font-bold py-2 px-3 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#B088F9] focus:ring-opacity-75 text-sm"
            >
              Enviar
            </button>
          </form>
        </section>
      </main>

      <footer className="bg-gray-950 text-white text-center p-2 rounded-t-xl text-xs">
        <p className="opacity-70">&copy; {new Date().getFullYear()} Watch Party Demo. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

export default App;

              
