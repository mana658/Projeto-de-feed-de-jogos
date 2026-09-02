const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs'); 
const path = require('path'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const prisma = new PrismaClient(); 

app.use(cors({ origin: "*" }));
app.use(express.json());

// =========================================================
// O INTERCEPTADOR FANTASMA (Deve ficar ANTES do express.static)
// =========================================================
app.get('/games/:filename', (req, res, next) => {
    if (req.query.raw === 'true') {
        return next(); 
    }

    const filePath = path.join(__dirname, 'public', 'games', req.params.filename);
    
    if (fs.existsSync(filePath)) {
        let rawHtml = fs.readFileSync(filePath, 'utf-8');
        
        const systemScript = `
        <script>
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    window.parent.postMessage('releaseFocus', '*');
                }
            });
        </script>
        `;
        
        res.send(rawHtml + systemScript);
    } else {
        next();
    }
});

// Arquivos estáticos normais
app.use(express.static('public'));

// Rota para criar um novo jogo direto pelo formulário
app.post('/api/games', async (req, res) => {
    const { title, authorId, code } = req.body;

    if (!title || !authorId || !code) {
        return res.status(400).json({ error: 'Título, autor e código são obrigatórios!' });
    }

    try {
        const cleanSlug = title.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');
        const fileName = `${cleanSlug}-${Date.now()}.html`;
        const gamesDir = path.join(__dirname, 'public', 'games');

        if (!fs.existsSync(gamesDir)) {
            fs.mkdirSync(gamesDir, { recursive: true });
        }

        const filePath = path.join(gamesDir, fileName);
        fs.writeFileSync(filePath, code, 'utf-8');

        // URL dinâmica baseada no host atual (Render ou Localhost)
        const host = req.get('host');
        const protocol = req.protocol;
        const sourceUrl = `${protocol}://${host}/games/${fileName}`;

        const newGame = await prisma.game.create({
            data: { title, authorId, sourceUrl }
        });

        console.log(`🎮 Jogo "${title}" criado e salvo limpo em: ${fileName}`);
        res.status(201).json(newGame);
    } catch (error) {
        console.error("Erro ao criar jogo:", error);
        res.status(500).json({ error: 'Erro interno ao salvar o jogo.' });
    }
});

// Rota de Feed Infinito Circular
app.get('/api/feed', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 2;

    try {
        const totalGames = await prisma.game.count();
        if (totalGames === 0) return res.json([]);

        const skip = ((page - 1) * limit) % totalGames;

        let games = await prisma.game.findMany({
            skip: skip,
            take: limit,
            orderBy: { id: 'asc' }
        });

        if (games.length < limit) {
            const complement = await prisma.game.findMany({
                skip: 0,
                take: limit - games.length,
                orderBy: { id: 'asc' }
            });
            games = [...games, ...complement];
        }

        res.json(games);
    } catch (error) {
        console.error("Erro no banco:", error);
        res.status(500).json({ error: 'Erro ao buscar jogos' });
    }
});

// Rota para Salvar o Código no Servidor (pós-edição)
app.post('/api/save', (req, res) => {
    const { sourceUrl, code } = req.body;
    try {
        const fileName = sourceUrl.split('/').pop().split('?')[0]; 
        const filePath = path.join(__dirname, 'public', 'games', fileName);

        fs.writeFileSync(filePath, code);

        io.emit('gameFileUpdated', { sourceUrl });
        res.json({ message: 'Jogo atualizado com sucesso!' });
    } catch (error) {
        console.error("Erro ao salvar arquivo:", error);
        res.status(500).json({ error: 'Erro interno ao salvar' });
    }
});

io.on('connection', (socket) => {
    console.log('Um dev se conectou:', socket.id);
    socket.on('codeChange', (newCode) => {
        socket.broadcast.emit('codeUpdate', newCode);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor API e WebSockets rodando na porta ${PORT}`);
});