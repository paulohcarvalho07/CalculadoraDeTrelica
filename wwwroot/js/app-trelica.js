// ==========================================================
// CONFIGURAÇÃO DO KONVA.JS
// ==========================================================

let currentTool = 'MEMBER';
const SNAP_RADIUS = 15;
// Inicialização
// Carrega dados salvos se existirem
const savedData = localStorage.getItem('truss_gallery');
if (savedData) {
    try {
        savedAnalyses = JSON.parse(savedData);
        updateAnalysisHistoryUI();
    } catch (e) {
        console.error("Erro ao carregar galeria salva:", e);
    }
}
// Configuração do Grid (Padrão inicial)
let gridConfig = {
    dx: 50, // Espaçamento Horizontal
    nx: 20, // Número de espaços Horizontais
    dy: 50, // Espaçamento Vertical
    ny: 16   // Número de espaços Verticais
};
const VISUAL_THEME = {
    tension: { stroke: '#4dabf7', fill: 'rgba(77, 171, 247, 0.12)' },
    compression: { stroke: '#ff6b6b', fill: 'rgba(255, 107, 107, 0.12)' },
    neutral: { stroke: '#96a4c2', fill: 'rgba(150, 164, 194, 0.16)' },
    reaction: { stroke: '#51cf66', fill: 'rgba(81, 207, 102, 0.16)' },
    labelBg: 'rgba(255, 255, 255, 0.92)',
    labelText: '#1f2532'
};
let legendGroup = null;

const RESULTS_PLACEHOLDER_HTML = `
    <div class="results-empty">
        <div class="results-empty-icon">🧮</div>
        <div>
            <p class="results-empty-title">Sem resultados por enquanto</p>
            <p class="results-empty-subtitle">Configure o modelo e clique em "Analisar Treliça" para visualizar os esforços.</p>
        </div>
    </div>
    `;

const RESULTS_LOADING_HTML = `
    <div class="results-status results-status--loading">
        <div class="results-status-icon">⏱️</div>
        <div>
            <p class="results-status-title">Processando análise</p>
            <p class="results-status-subtitle">Calculando esforços internos e reações de apoio...</p>
        </div>
    </div>
    `;

function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildErrorHtml(message) {
    return `
    <div class="results-error">
            <div class="results-error-icon">⚠️</div>
            <div>
                <p class="results-error-title">Erro na análise</p>
                <p class="results-error-subtitle">${message}</p>
            </div>
        </div>
    `;
}

// --- MUDANÇA AQUI ---
// 1. Pega o container do HTML
const canvasContainer = document.getElementById('canvas-container');

// 2. Lê o tamanho REAL do container (definido pelo CSS: 100% e 70vh)
// 2. Lê o tamanho REAL do container (definido pelo CSS: 100% e 70vh)
let CANVAS_WIDTH = canvasContainer.clientWidth;
let CANVAS_HEIGHT = canvasContainer.clientHeight;

// --- FUNÇÃO AUXILIAR DE COORDENADAS (MUNDO VS TELA) ---
// Converte coordenadas da tela (mouse) para coordenadas do mundo (grid)
// considerando zoom e pan (scale e offset)
function screenToWorld(pos) {
    var transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    return transform.point(pos);
}
// --- FIM DA MUDANÇA ---

// Estado do Desenho
let drawingLine = null;
let memberStartPos = null;

// Bancos de dados locais
let nodes = [];
let members = [];
let supports = [];
let loads = [];
let nextNodeId = 0;
let nextMemberId = 0;

// Pilha de histórico
let historyStack = [];

// Setup do Konva (agora usa as constantes dinâmicas)
const stage = new Konva.Stage({
    container: 'canvas-container',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    draggable: false, // Desabilita o Pan nativo para controle manual estrito
    pixelRatio: window.devicePixelRatio || 1 // High DPI Scaling
});

// Configuração do Zoom Inteligente
const scaleBy = 1.1;
stage.on('wheel', (e) => {
    // Para a propagação do scroll da página
    e.evt.preventDefault();

    var oldScale = stage.scaleX();
    var pointer = stage.getPointerPosition();

    var mousePointTo = screenToWorld(pointer);

    var newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    // Limita o zoom
    if (newScale < 0.1) newScale = 0.1;
    if (newScale > 5) newScale = 5;

    stage.scale({ x: newScale, y: newScale });

    var newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
});

// Variáveis para controle de Pan (Botão Direito)
let isDragging = false;
let hasDragged = false;
let startDragPos = { x: 0, y: 0 };

function setCursor(cursor) {
    stage.container().style.cursor = cursor;
}

const gridLayer = new Konva.Layer();
const memberLayer = new Konva.Layer();
const nodeLayer = new Konva.Layer();
const resultsLayer = new Konva.Layer();
const idLayer = new Konva.Layer();
const angleLayer = new Konva.Layer(); // Camada para ângulos entre barras
const feedbackLayer = new Konva.Layer();
stage.add(gridLayer, memberLayer, angleLayer, nodeLayer, idLayer, resultsLayer, feedbackLayer);

drawGrid();

// ==========================================================
// LÓGICA DE FERRAMENTAS (Toolbar)
// ==========================================================
function setTool(toolName) {
    currentTool = toolName;
    document.querySelectorAll('.toolbar button').forEach(btn => btn.classList.remove('active'));

    const toolButton = document.getElementById(`tool - ${toolName.toLowerCase().split('_')[0]} `);
    if (toolButton) toolButton.classList.add('active');

    if (drawingLine) drawingLine.destroy();
    drawingLine = null;
    memberStartPos = null;
    feedbackLayer.batchDraw();

    const color = {
        'MEMBER': '#007bff', 'PINNED': '#28a745',
        'ROLLER_Y': '#17a2b8', 'LOAD': '#dc3545'
    }[toolName];
    if (color) document.documentElement.style.setProperty('--cor-pincel', color);

    const loadConfig = document.getElementById('load-config');
    if (toolName === 'LOAD') {
        loadConfig.style.display = 'block';
    } else {
        loadConfig.style.display = 'none';
    }
}

// Função updateGridSize removida (substituída por applyGridSettings)

// Função para redimensionar o canvas quando a janela mudar
function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    CANVAS_WIDTH = container.clientWidth;
    CANVAS_HEIGHT = container.clientHeight;

    stage.width(CANVAS_WIDTH);
    stage.height(CANVAS_HEIGHT);

    drawGrid(); // Redesenha o grid centralizado

    // Redesenha tudo
    gridLayer.batchDraw();
    memberLayer.batchDraw();
    nodeLayer.batchDraw();
    idLayer.batchDraw();
    resultsLayer.batchDraw();
    feedbackLayer.batchDraw();
}

// Usa ResizeObserver para detectar mudanças no tamanho do container (mais robusto que window.resize)
const resizeObserver = new ResizeObserver(() => {
    resizeCanvas();
});
resizeObserver.observe(canvasContainer);

// Chama uma vez no início para garantir
resizeCanvas();

// NOVO: Função para Limpar o Canvas
// NOVO: Função para Limpar o Canvas
function resetCanvas(keepActionLog = false) {
    if (keepActionLog) {
        forceResetCanvas(true);
        return;
    }

    Swal.fire({
        title: 'Tem certeza?',
        text: "Você deseja apagar todo o desenho? Esta ação não pode ser desfeita.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, limpar!',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            forceResetCanvas(false);
            Swal.fire(
                'Limpo!',
                'O desenho foi apagado.',
                'success'
            )
        }
    });
}

function forceResetCanvas(keepActionLog = false) {
    // Limpa os dados
    nodes = [];
    members = [];
    supports = [];
    loads = [];
    historyStack = [];
    if (!keepActionLog) actionLog = []; // Limpa log se não for replay

    // Reseta os contadores de ID
    nextNodeId = 0;
    nextMemberId = 0;

    // Limpa as camadas do Konva
    nodeLayer.destroyChildren();
    memberLayer.destroyChildren();
    idLayer.destroyChildren();
    resultsLayer.destroyChildren();
    feedbackLayer.destroyChildren(); // Limpa linhas flutuantes

    // NOVO: Resetar Viewport (Pan/Zoom)
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();

    // Redesenha o grid (que também limpa a camada do grid)
    drawGrid();

    // Limpa a caixa de resultados
    resetAnalysisDisplay();
    resetAnalysisDisplay();
    updateAngles();
    validateTrussStatus(); // Atualiza validação

    console.log("Canvas resetado.");
}

// ==========================================================
// LÓGICA DO HISTÓRICO DE ANÁLISES (REPLAY)
// ==========================================================

let actionLog = []; // Log de ações da sessão atual
let savedAnalyses = []; // Lista de análises salvas com sucesso
let isReplaying = false; // Flag para evitar log duplicado durante replay

function logAction(action) {
    if (isReplaying) return; // Não loga ações durante o replay
    actionLog.push(action);
}

function updateAnalysisHistoryUI() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    if (savedAnalyses.length === 0) {
        historyList.innerHTML = '<div class="w-100 text-muted fst-italic text-center py-3">Nenhuma análise salva</div>';
        return;
    }

    let html = '';
    // Mostra do mais recente para o mais antigo
    savedAnalyses.slice().reverse().forEach((session, index) => {
        // O índice real no array original (para referência se precisasse, mas agora é só visual)
        const realIndex = savedAnalyses.length - 1 - index;

        html += `
    < div class="border rounded overflow-hidden shadow-sm" style = "width: 80px; height: 80px; cursor: default;" title = "${session.name} - ${session.timestamp}" >
        ${session.image ?
                `<img src="${session.image}" alt="${session.name}" style="width: 100%; height: 100%; object-fit: cover;">` :
                '<div class="d-flex align-items-center justify-content-center h-100 bg-light"><i class="bi bi-image text-muted"></i></div>'
            }
            </div >
    `;
    });

    historyList.innerHTML = html;
}

function restoreSession(index) {
    if (index < 0 || index >= savedAnalyses.length) return;

    const session = savedAnalyses[index];
    const logToRestore = session.log;

    if (!confirm(`Deseja restaurar a análise "${session.name}" ? O desenho atual será substituído.`)) {
        return;
    }

    // Executa todas as ações INSTANTANEAMENTE
    try {
        // Limpa tudo e o log atual
        forceResetCanvas(false);

        if (!logToRestore || logToRestore.length === 0) {
            alert("Este item do histórico não possui ações registradas (Log vazio).");
            return;
        }

        // Restaura o log da sessão
        actionLog = JSON.parse(JSON.stringify(logToRestore));

        isReplaying = true; // Bloqueia log durante a restauração

        console.log(`Restaurando: ${session.name} `);

        for (const action of logToRestore) {
            switch (action.type) {
                case 'node':
                    findOrCreateNodeAt({ x: action.x, y: action.y }, action.id);
                    break;
                case 'member':
                    const nodeA = nodes.find(n => n.id === action.startNodeId);
                    const nodeB = nodes.find(n => n.id === action.endNodeId);
                    if (nodeA && nodeB) createMember(nodeA, nodeB, action.id);
                    break;
                case 'support':
                    addSupport(action.nodeId, action.supportType);
                    break;
                case 'load':
                    document.getElementById('load-magnitude').value = action.magnitude;
                    document.getElementById('load-angle').value = action.angle;
                    addLoad(action.nodeId);
                    break;
            }
        }
        // Redesenha tudo de uma vez no final
        nodeLayer.batchDraw();
        memberLayer.batchDraw();
        idLayer.batchDraw();
        idLayer.batchDraw();
        resultsLayer.batchDraw();
        resultsLayer.batchDraw();
        updateAngles();
        validateTrussStatus(); // Atualiza validação após restore
    } catch (e) {
        console.error("Erro ao restaurar:", e);
        alert("Ocorreu um erro ao restaurar a treliça.");
    } finally {
        isReplaying = false;
        console.log("Restauração concluída (Flag resetada).");
    }
}

// ==========================================================
// MODIFICAÇÕES NAS FUNÇÕES DE CRIAÇÃO PARA LOGAR AÇÕES
// ==========================================================

// As funções originais (findOrCreateNodeAt, createMember, etc.) precisam chamar logAction.
// Vamos fazer isso via replace pontual ou reescrevendo-as.
// Como já estamos aqui, vamos reescrever as partes relevantes ou injetar.

// Melhor abordagem: Injetar logAction nas funções existentes.
// Mas este bloco substitui o antigo bloco de histórico.
// O antigo bloco tinha pushToHistory, updateHistoryUI, undoLastAction.
// Vamos manter undoLastAction (adaptado) e remover o resto.

// Função para adicionar ação ao histórico de desfazer
function pushToHistory(type, id, undoFunction) {
    historyStack.push({ type, id, undoFunction });
}

// Adaptação do undoLastAction para o novo sistema (remove do log também)
function undoLastAction() {
    if (historyStack.length === 0) return;

    const lastAction = historyStack.pop();
    actionLog.pop(); // Remove também do log de replay

    lastAction.undoFunction();

    if (lastAction.type === 'node' && lastAction.id === nextNodeId - 1) {
        nextNodeId--;
    } else if (lastAction.type === 'member' && lastAction.id === nextMemberId - 1) {
        nextMemberId--;
    }

    memberLayer.batchDraw();
    nodeLayer.batchDraw();
    idLayer.batchDraw();
    resultsLayer.batchDraw();
}

// Função auxiliar para salvar análise com sucesso
function saveSuccessfulAnalysis() {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const session = {
        name: `Treliça #${savedAnalyses.length + 1} `,
        timestamp: timeString,
        log: JSON.parse(JSON.stringify(actionLog)) // Deep copy
    };

    savedAnalyses.push(session);

    // Salva no localStorage para persistência
    localStorage.setItem('truss_gallery', JSON.stringify(savedAnalyses));

    updateAnalysisHistoryUI();
}

// Mostra o histórico vazio ao carregar
window.addEventListener('load', function () {
    updateAnalysisHistoryUI();
});

function removeActionFromHistory(type, id) {
    historyStack = historyStack.filter(action =>
        !(action.type === type && action.id === id)
    );
    // Removemos do actionLog também?
    // Se removermos, o replay não terá essa ação.
    // Se o usuário apagou, ele provavelmente não quer ver no replay.
    // Mas o replay é "o que deu certo". Se ele apagou, não faz parte do final.
    // Então devemos remover.
    actionLog = actionLog.filter(action =>
        !(action.type === type && (action.id === id || action.nodeId === id || action.memberId === id))
    );
}

// Funções de remoção
function undoNode(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const dependentMembers = members.filter(m => m.startNodeId === nodeId || m.endNodeId === nodeId);
    dependentMembers.forEach(m => {
        removeActionFromHistory('member', m.id);
        undoMember(m.id);
    });
    const dependentSupport = supports.find(s => s.nodeId === nodeId);
    if (dependentSupport) {
        removeActionFromHistory('support', nodeId);
        undoSupport(nodeId);
    }
    const dependentLoad = loads.find(l => l.nodeId === nodeId);
    if (dependentLoad) {
        removeActionFromHistory('load', nodeId);
        undoLoad(nodeId);
    }
    if (node.konvaCircle) node.konvaCircle.destroy();
    if (node.konvaIdText) node.konvaIdText.destroy();
    nodes = nodes.filter(n => n.id !== nodeId);
    resetAnalysisDisplay();
    updateAngles();
    validateTrussStatus();
}

function undoMember(memberId) {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    if (member.konvaLine) member.konvaLine.destroy();
    if (member.konvaIdText) member.konvaIdText.destroy();
    members = members.filter(m => m.id !== memberId);
    resetAnalysisDisplay();
    updateAngles();
    validateTrussStatus();
}

function undoSupport(nodeId) {
    const support = supports.find(s => s.nodeId === nodeId);
    if (!support) return;
    if (support.konvaVisual) support.konvaVisual.destroy();
    supports = supports.filter(s => s.nodeId !== nodeId);
    resetAnalysisDisplay();
    validateTrussStatus();
}

function undoLoad(nodeId) {
    const load = loads.find(l => l.nodeId === nodeId);
    if (!load) return;
    if (load.konvaArrow) load.konvaArrow.destroy();
    if (load.konvaLabel) load.konvaLabel.destroy(); // Remove o texto
    loads = loads.filter(l => l.nodeId !== nodeId);
    resetAnalysisDisplay();
    validateTrussStatus();
}

// ==========================================================
// LÓGICA DE APAGAR (Botão Direito)
// ==========================================================
stage.on('contextmenu', (e) => {
    e.evt.preventDefault();

    // Se houve arrasto (Pan), não executa a ação de apagar/cancelar
    if (hasDragged) {
        hasDragged = false;
        return;
    }

    // Se estiver desenhando uma linha (Polyline), o botão direito cancela o desenho atual
    if (drawingLine) {
        drawingLine.destroy();
        drawingLine = null;
        memberStartPos = null;
        feedbackLayer.batchDraw();
        return; // Não faz mais nada (não apaga objetos abaixo)
    }

    const target = e.target;
    if (target.hasName('node')) {
        const nodeId = target.getAttr('nodeId');
        removeActionFromHistory('node', nodeId);
        undoNode(nodeId);
    }
    else if (target.hasName('member')) {
        const memberId = target.getAttr('memberId');
        removeActionFromHistory('member', memberId);
        undoMember(memberId);
    }
    else if (target.hasName('support')) {
        const nodeId = target.getAttr('nodeId');
        removeActionFromHistory('support', nodeId);
        undoSupport(nodeId);
    }
    else if (target.hasName('load') || target.hasName('load-label')) { // Detecta clique no texto também
        const nodeId = target.getAttr('nodeId');
        removeActionFromHistory('load', nodeId);
        undoLoad(nodeId);
    }
    memberLayer.batchDraw();
    nodeLayer.batchDraw();
    idLayer.batchDraw();
});

// ==========================================================
// LÓGICA PRINCIPAL DE DESENHO (MD-SOLIDS)
// ==========================================================

stage.on('click', (e) => {
    if (currentTool === 'MEMBER') return; // Lógica movida para mousedown/mouseup (Híbrido)

    // --- OUTRAS FERRAMENTAS (Apoios, Cargas) ---
    // Em vez de checar se clicou exatamente no objeto visual (e.target),
    // verificamos se o clique foi PRÓXIMO de algum nó (Snap Radius).
    // Isso permite clicar no texto, ou um pouco ao lado, e ainda funcionar.
    // verificamos se o clique foi PRÓXIMO de algum nó (Snap Radius).
    // Isso permite clicar no texto, ou um pouco ao lado, e ainda funcionar.
    const rawPos = stage.getRelativePointerPosition(); // Isso já retorna relativo ao stage transformado? Não.
    // getRelativePointerPosition retorna a posição relativa ao container, mas precisamos considerar o transform do stage se ele for draggable/scale.
    // Na verdade, para encontrar objetos, o Konva lida com hit graph.
    // Mas para nossa lógica de distância manual:
    const pos = screenToWorld(stage.getPointerPosition());

    const clickedNode = nodes.find(n => dist(n.x, n.y, pos.x, pos.y) < SNAP_RADIUS);

    if (!clickedNode) return;
    const nodeId = clickedNode.id;

    if (currentTool === 'PINNED') addSupport(nodeId, 'Pinned');
    else if (currentTool === 'ROLLER_Y') addSupport(nodeId, 'Roller_Y');
    else if (currentTool === 'LOAD') addLoad(nodeId);
});

stage.on('mousedown', (e) => {
    // 1. Lógica de Pan (Botão Direito - 2)
    if (e.evt.button === 2) {
        isDragging = true;
        hasDragged = false;
        startDragPos = stage.getPointerPosition();
        setCursor('grabbing');
        return;
    }

    // 2. Lógica de Desenho (Apenas Botão Esquerdo - 0)
    if (e.evt.button !== 0) return;

    if (currentTool !== 'MEMBER') return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    const rawPos = screenToWorld(pointerPos);
    let pos;
    let clickedNode = nodes.find(n => dist(n.x, n.y, rawPos.x, rawPos.y) < SNAP_RADIUS);
    if (clickedNode) {
        pos = { x: clickedNode.x, y: clickedNode.y };
    } else {
        pos = snapToGrid(rawPos);
    }

    if (drawingLine) {
        // SEGUNDO PASSO (Click-Move-Click):
        const endNode = findOrCreateNodeAt(pos);

        if (memberStartPos.x !== endNode.x || memberStartPos.y !== endNode.y) {
            const nodeA = nodes.find(n => n.x === memberStartPos.x && n.y === memberStartPos.y);
            createMember(nodeA, endNode);

            memberLayer.batchDraw();
            nodeLayer.batchDraw();
            idLayer.batchDraw();
        }

        drawingLine.destroy();
        drawingLine = null;
        memberStartPos = null;
        feedbackLayer.batchDraw();
    } else {
        // PRIMEIRO PASSO (Início):
        const startNode = findOrCreateNodeAt(pos);
        memberStartPos = { x: startNode.x, y: startNode.y };

        nodeLayer.batchDraw();
        idLayer.batchDraw();

        drawingLine = new Konva.Line({
            points: [memberStartPos.x, memberStartPos.y, memberStartPos.x, memberStartPos.y],
            stroke: '#007bff', strokeWidth: 3, dash: [5, 5],
        });
        feedbackLayer.add(drawingLine);
        feedbackLayer.batchDraw();
    }
});

stage.on('mousemove', (e) => {
    // 1. Lógica de Pan (Arrastar com Botão Direito)
    if (isDragging) {
        const currentPointerPos = stage.getPointerPosition();
        if (!currentPointerPos) return;

        const dx = currentPointerPos.x - startDragPos.x;
        const dy = currentPointerPos.y - startDragPos.y;

        // Considera como arrasto apenas se mover um pouco
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            hasDragged = true;
        }

        const newPos = {
            x: stage.x() + dx,
            y: stage.y() + dy
        };
        stage.position(newPos);
        stage.batchDraw();

        startDragPos = currentPointerPos;
        return;
    }

    // 2. Lógica de Preview/Hover (Cursor Crosshair)
    setCursor('crosshair');

    if (!drawingLine) return;
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    const rawPos = screenToWorld(pointerPos);
    let snappedPos;
    let targetNode = nodes.find(n => dist(n.x, n.y, rawPos.x, rawPos.y) < SNAP_RADIUS);
    if (targetNode) {
        snappedPos = { x: targetNode.x, y: targetNode.y };
    } else {
        snappedPos = snapToGrid(rawPos);
    }
    drawingLine.points([memberStartPos.x, memberStartPos.y, snappedPos.x, snappedPos.y]);

    feedbackLayer.batchDraw();
});

stage.on('mouseup mouseleave', (e) => {
    // 1. Finaliza Pan
    if (isDragging) {
        // Se soltou o botão direito (2) ou saiu da tela
        if (e.type === 'mouseleave' || e.evt.button === 2) {
            isDragging = false;
            setCursor('default');
        }
        return;
    }

    // 2. Lógica de Desenho (Apenas Botão Esquerdo - 0)
    if (e.type === 'mouseup' && e.evt.button !== 0) return;

    if (currentTool !== 'MEMBER') return;
    if (!drawingLine) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    const rawEndPos = screenToWorld(pointerPos);
    let endPos;
    let clickedNode = nodes.find(n => dist(n.x, n.y, rawEndPos.x, rawEndPos.y) < SNAP_RADIUS);
    if (clickedNode) {
        endPos = { x: clickedNode.x, y: clickedNode.y };
    } else {
        endPos = snapToGrid(rawEndPos);
    }

    // Verifica se houve movimento significativo (Drag-and-Drop)
    if (memberStartPos.x !== endPos.x || memberStartPos.y !== endPos.y) {
        const endNode = findOrCreateNodeAt(endPos);
        const nodeA = nodes.find(n => n.x === memberStartPos.x && n.y === memberStartPos.y);

        createMember(nodeA, endNode);

        memberLayer.batchDraw();
        nodeLayer.batchDraw();
        idLayer.batchDraw();

        // Finaliza o desenho
        drawingLine.destroy();
        drawingLine = null;
        memberStartPos = null;
        feedbackLayer.batchDraw();
    }
});

// Cancelar desenho com ESC
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (drawingLine) {
            drawingLine.destroy();
            drawingLine = null;
            memberStartPos = null;
            feedbackLayer.batchDraw();
        }
    }
});

// ==========================================================
// FUNÇÕES AUXILIARES DE CRIAÇÃO
// ==========================================================

function dist(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

// let GRID_STEP = 50; // REMOVIDO: Agora usamos gridConfig

// ...

function snapToGrid(pos) {
    // Ajusta a posição relativa ao início do grid
    const relativeX = pos.x - gridConfig.startX;
    const relativeY = pos.y - gridConfig.startY;

    // Encontra o índice do grid mais próximo
    let ix = Math.round(relativeX / gridConfig.dx);
    let iy = Math.round(relativeY / gridConfig.dy);

    // Clampa os índices para ficar dentro do grid
    if (ix < 0) ix = 0;
    if (ix > gridConfig.nx) ix = gridConfig.nx;
    if (iy < 0) iy = 0;
    if (iy > gridConfig.ny) iy = gridConfig.ny;

    // Calcula a posição absoluta
    const snappedX = gridConfig.startX + (ix * gridConfig.dx);
    const snappedY = gridConfig.startY + (iy * gridConfig.dy);

    return { x: snappedX, y: snappedY };
}

function findOrCreateNodeAt(pos, forceId = null) {
    let existingNode = nodes.find(n => n.x === pos.x && n.y === pos.y);
    if (existingNode) {
        return existingNode;
    }

    let nodeId;
    if (forceId !== null && forceId !== undefined) {
        nodeId = forceId;
        // Atualiza o contador para evitar colisão futura
        if (nodeId >= nextNodeId) nextNodeId = nodeId + 1;
    } else {
        nodeId = nextNodeId++;
    }

    const newNode = { id: nodeId, x: pos.x, y: pos.y };
    const konvaCircle = new Konva.Circle({
        x: newNode.x, y: newNode.y,
        radius: 8, fill: 'white', stroke: 'black', strokeWidth: 2,
        name: 'node', nodeId: nodeId, draggable: false,
    });
    konvaCircle.on('contextmenu', (e) => {
        e.evt.preventDefault();
        removeActionFromHistory('node', nodeId);
        undoNode(nodeId);
        nodeLayer.batchDraw();
        memberLayer.batchDraw();
    });
    nodeLayer.add(konvaCircle);
    newNode.konvaCircle = konvaCircle;

    const idText = new Konva.Text({
        x: newNode.x + 12,
        y: newNode.y - 12,
        text: `N${nodeId} `,
        fontSize: 14,
        fill: '#666'
    });
    idLayer.add(idText);
    newNode.konvaIdText = idText;

    nodes.push(newNode);
    pushToHistory('node', nodeId, () => undoNode(nodeId));
    logAction({ type: 'node', x: pos.x, y: pos.y, id: nodeId });
    validateTrussStatus();
    return newNode;
}

function createMember(nodeA, nodeB, forceId = null) {
    let exists = members.find(m =>
        (m.startNodeId === nodeA.id && m.endNodeId === nodeB.id) ||
        (m.startNodeId === nodeB.id && m.endNodeId === nodeA.id)
    );
    if (exists) return;

    let memberId;
    if (forceId !== null && forceId !== undefined) {
        memberId = forceId;
        if (memberId >= nextMemberId) nextMemberId = memberId + 1;
    } else {
        memberId = nextMemberId++;
    }

    const newMember = {
        id: memberId,
        startNodeId: nodeA.id,
        endNodeId: nodeB.id,
    };
    const konvaLine = new Konva.Line({
        points: [nodeA.x, nodeA.y, nodeB.x, nodeB.y],
        stroke: 'black', strokeWidth: 3,
        name: 'member', memberId: memberId,
    });
    konvaLine.on('contextmenu', (e) => {
        e.evt.preventDefault();
        removeActionFromHistory('member', memberId);
        undoMember(memberId);
        memberLayer.batchDraw();
    });
    memberLayer.add(konvaLine);
    newMember.konvaLine = konvaLine;

    const midX = (nodeA.x + nodeB.x) / 2;
    const midY = (nodeA.y + nodeB.y) / 2;

    const idText = new Konva.Text({
        x: midX, y: midY,
        text: `B${memberId} `,
        fontSize: 14,
        fill: '#007bff',
        padding: 2,
        visible: false // Oculto por padrão para limpeza visual
    });
    // idLayer.add(idText); // Removido do layer para não renderizar
    newMember.konvaIdText = idText; // Mantém referência para evitar erros de null pointer

    members.push(newMember);
    pushToHistory('member', memberId, () => undoMember(memberId));
    logAction({ type: 'member', startNodeId: nodeA.id, endNodeId: nodeB.id, id: memberId });
    updateAngles();
    validateTrussStatus();
}

function calculateAngle(x1, y1, x2, y2) {
    // Inverte Y porque o canvas cresce para baixo
    const dy = -(y2 - y1);
    const dx = x2 - x1;
    let theta = Math.atan2(dy, dx); // Radianos (-PI a PI)
    let degrees = theta * 180 / Math.PI; // Graus (-180 a 180)

    // Normaliza para 0-180 (apenas inclinação)
    if (degrees < 0) degrees += 360;
    if (degrees >= 180) degrees -= 180;

    return degrees;
}

function addSupport(nodeId, type) {
    // Se já existe um apoio neste nó, remove o anterior para substituir (comportamento de troca)
    if (supports.find(s => s.nodeId === nodeId)) {
        removeActionFromHistory('support', nodeId);
        undoSupport(nodeId);
    }
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newSupport = {
        nodeId: nodeId,
        type: type === 'Pinned' ? 0 : 2 // 0=Pinned, 2=RollerY
    };
    let visualSupport;
    if (type === 'Pinned') {
        visualSupport = new Konva.RegularPolygon({
            x: node.x, y: node.y + 15, sides: 3, radius: 10, fill: '#28a745',
            name: 'support', nodeId: nodeId,
        });
    } else { // RollerY
        visualSupport = new Konva.Circle({
            x: node.x, y: node.y + 10,
            radius: 8, fill: 'white', stroke: '#17a2b8', strokeWidth: 2,
            name: 'support', nodeId: nodeId,
        });
    }
    visualSupport.on('contextmenu', (e) => {
        e.evt.preventDefault();
        removeActionFromHistory('support', nodeId);
        undoSupport(nodeId);
        nodeLayer.batchDraw();
    });
    nodeLayer.add(visualSupport);
    newSupport.konvaVisual = visualSupport;
    supports.push(newSupport);
    pushToHistory('support', nodeId, () => undoSupport(nodeId));
    pushToHistory('support', nodeId, () => undoSupport(nodeId));
    logAction({ type: 'support', nodeId: nodeId, supportType: type });
    validateTrussStatus();
}

function addLoad(nodeId) {
    // Se já existe uma carga neste nó, remove a anterior para substituir (comportamento de troca)
    if (loads.find(l => l.nodeId === nodeId)) {
        removeActionFromHistory('load', nodeId);
        undoLoad(nodeId);
    }
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const magnitude = parseFloat(document.getElementById('load-magnitude').value);
    const angle_deg = parseFloat(document.getElementById('load-angle').value);

    if (isNaN(magnitude) || isNaN(angle_deg)) {
        alert("Valores de Carga inválidos. Verifique os campos na barra de ferramentas.");
        return;
    }

    // Converte para o sistema do Solver (+Y para Cima)
    const angle_rad_solver = angle_deg * Math.PI / 180;
    const fx = magnitude * Math.cos(angle_rad_solver);
    const fy = magnitude * Math.sin(angle_rad_solver);

    const newLoad = { nodeId: nodeId, fx: fx, fy: fy };

    // Converte para o sistema do Konva (+Y para Baixo)
    const angle_rad_visual = (-angle_deg) * Math.PI / 180;
    const arrowLength = 50;
    const endX = node.x + arrowLength * Math.cos(angle_rad_visual);
    const endY = node.y + arrowLength * Math.sin(angle_rad_visual);

    const konvaArrow = new Konva.Arrow({
        points: [node.x, node.y, endX, endY],
        pointerLength: 10, pointerWidth: 10,
        fill: '#dc3545', stroke: '#dc3545', strokeWidth: 3,
        name: 'load', nodeId: nodeId,
    });

    // Adiciona um rótulo de texto com o valor da carga
    const textX = endX + (endX > node.x ? 5 : -35);
    const textY = endY + (endY > node.y ? 5 : -20);

    const konvaLabel = new Konva.Text({
        x: textX,
        y: textY,
        text: `${magnitude} N`,
        fontSize: 12,
        fill: '#dc3545',
        fontStyle: 'bold',
        name: 'load-label',
        nodeId: nodeId
    });

    konvaArrow.on('contextmenu', (e) => {
        e.evt.preventDefault();
        removeActionFromHistory('load', nodeId);
        undoLoad(nodeId);
        nodeLayer.batchDraw();
    });

    konvaLabel.on('contextmenu', (e) => {
        e.evt.preventDefault();
        removeActionFromHistory('load', nodeId);
        undoLoad(nodeId);
        nodeLayer.batchDraw();
    });

    nodeLayer.add(konvaArrow);
    nodeLayer.add(konvaLabel);

    newLoad.konvaArrow = konvaArrow;
    newLoad.konvaLabel = konvaLabel;

    loads.push(newLoad);
    pushToHistory('load', nodeId, () => undoLoad(nodeId));
    pushToHistory('load', nodeId, () => undoLoad(nodeId));
    logAction({ type: 'load', nodeId: nodeId, magnitude: magnitude, angle: angle_deg });
    validateTrussStatus();
}

// ==========================================================
// LIGAÇÃO COM O BACKEND C#
// ==========================================================
// ==========================================================
// LIGAÇÃO COM O BACKEND C#
// ==========================================================
const API_URL = "/Calculadora/Calcular";

async function analyzeTruss() {
    const resultsDiv = document.getElementById("results");
    resetAnalysisDisplay(true);
    resultsDiv.innerHTML = RESULTS_LOADING_HTML;

    let dadosTrelica = {
        Nos: nodes.map(n => ({ Id: n.id, X: n.x, Y: -n.y })),
        Barras: members.map(m => ({ Id: m.id, IdNoInicial: m.startNodeId, IdNoFinal: m.endNodeId })),
        Apoios: supports.map(s => ({ IdNo: s.nodeId, Tipo: s.type })),
        Cargas: loads.map(l => ({ IdNo: l.nodeId, Fx: l.fx, Fy: l.fy }))
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dadosTrelica)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.mensagem || `Erro HTTP: ${response.status} `);
        }
        const resultsData = await response.json();
        resultsDiv.innerHTML = buildResultsHtml(resultsData);
        displayResultsOnCanvas(resultsData);
        saveSuccessfulAnalysis(); // Salva no histórico de replay
    } catch (error) {
        console.error("Falha ao chamar API:", error);
        resultsDiv.innerHTML = buildErrorHtml(escapeHtml(error.message || "Ocorreu um erro inesperado."));
    }
}

// ==========================================================
// EXIBIÇÃO DE RESULTADOS (Gráfico e Texto)
// ==========================================================

function buildResultsHtml(results) {
    const forcasBarras = Array.isArray(results?.ForcasBarras) ? results.ForcasBarras : [];
    const reacoesApoio = Array.isArray(results?.ReacoesApoio) ? results.ReacoesApoio : [];

    const memberContent = forcasBarras.map(force => {
        const rawType = typeof force.Tipo === 'string' ? force.Tipo : 'Indefinido';
        const safeType = escapeHtml(rawType);
        const memberId = escapeHtml(`B${force.IdBarra ?? '-'} `);
        const forceValue = Number(force.Forca);
        const formattedForce = Number.isFinite(forceValue) ? Math.abs(forceValue).toFixed(1) : '0.0';
        const cardClass = rawType === 'Tração' ? 'tension' : rawType === 'Compressão' ? 'compression' : 'neutral';
        const pillModifier = rawType === 'Tração' ? ' result-pill--tension' : rawType === 'Compressão' ? ' result-pill--compression' : '';

        return `
            <div class="result-card ${cardClass}">
                <div class="result-card-header">
                    <span class="result-pill${pillModifier}">${memberId}</span>
                    <span class="result-type">${safeType}</span>
                </div>
                <p class="result-value">${formattedForce} <span>N</span></p>
            </div>
        `;
    }).join('');

    const memberSection = memberContent || `
        <div class="result-card result-card--empty">
            <p class="result-empty-title">Nenhuma barra analisada</p>
            <p class="result-empty-subtitle">Adicione membros e execute a análise para ver os esforços internos.</p>
        </div>
    `;

    const reactionSectionContent = reacoesApoio.map(reaction => {
        const nodeId = escapeHtml(`N${reaction.IdNo ?? '-'} `);
        const rxValue = Number(reaction.Rx);
        const ryValue = Number(reaction.Ry);
        const formattedRx = Number.isFinite(rxValue) ? rxValue.toFixed(1) : '0.0';
        const formattedRy = Number.isFinite(ryValue) ? ryValue.toFixed(1) : '0.0';

        return `
            <div class="result-card">
                <div class="result-card-header">
                    <span class="result-pill result-pill--support">Apoio ${nodeId}</span>
                </div>
                <div class="result-metrics">
                    <div class="result-metric">
                        <span class="label">Rx</span>
                        <span class="value">${formattedRx} N</span>
                    </div>
                    <div class="result-metric">
                        <span class="label">Ry</span>
                        <span class="value">${formattedRy} N</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const reactionSection = reactionSectionContent || `
        <div class="result-card result-card--empty">
            <p class="result-empty-title">Sem reações calculadas</p>
            <p class="result-empty-subtitle">Inclua apoios para visualizar as forças de reação.</p>
        </div>
    `;

    return `
        <div class="results-section">
            <div class="results-section-header">
                <span class="results-section-kicker">Forças Internas</span>
                <span class="results-section-caption">Resultados nas barras conectadas</span>
            </div>
            <div class="result-grid">
                ${memberSection}
            </div>
        </div>
        <div class="results-section">
            <div class="results-section-header">
                <span class="results-section-kicker">Reações de Apoio</span>
                <span class="results-section-caption">Componentes horizontais e verticais</span>
            </div>
            <div class="result-grid">
                ${reactionSection}
            </div>
        </div>
    `;
}

function displayResultsOnCanvas(results) {
    resultsLayer.destroyChildren();

    members.forEach(m => { if (m.konvaIdText) m.konvaIdText.hide(); });
    nodes.forEach(n => n.konvaIdText.show());
    idLayer.draw();

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const forcasBarras = Array.isArray(results?.ForcasBarras) ? results.ForcasBarras : [];
    const reacoesApoio = Array.isArray(results?.ReacoesApoio) ? results.ReacoesApoio : [];

    for (const force of forcasBarras) {
        const member = members.find(m => m.id === force.IdBarra);
        if (!member || !member.konvaLine) continue;

        const val = Math.abs(force.Forca ?? 0);
        const isZero = val < 0.01;
        const isTension = force?.Tipo === "Tração";
        const isCompression = force?.Tipo === "Compressão";

        // Convenção de Cores
        const COLOR_TENSION = '#0d6efd';     // Azul
        const COLOR_COMPRESSION = '#dc3545'; // Vermelho
        const COLOR_ZERO = '#adb5bd';        // Cinza Claro

        let strokeColor = COLOR_ZERO;
        let dashArray = [];
        let strokeWidth = 2;

        if (isZero) {
            strokeColor = COLOR_ZERO;
            dashArray = [10, 5];
            strokeWidth = 2;
        } else if (isTension) {
            strokeColor = COLOR_TENSION;
            strokeWidth = 3;
        } else if (isCompression) {
            strokeColor = COLOR_COMPRESSION;
            strokeWidth = 3;
        }

        // Atualiza a linha da barra
        member.konvaLine.stroke(strokeColor);
        member.konvaLine.strokeWidth(strokeWidth);
        member.konvaLine.dash(dashArray);
        member.konvaLine.shadowColor(strokeColor);
        member.konvaLine.shadowBlur(isZero ? 0 : 10);
        member.konvaLine.shadowOpacity(isZero ? 0 : 0.2);

        // Se for zero, NÃO desenha etiqueta
        if (isZero) continue;

        const nodeA = nodeMap.get(member.startNodeId);
        const nodeB = nodeMap.get(member.endNodeId);
        if (!nodeA || !nodeB) continue;

        const midX = (nodeA.x + nodeB.x) / 2;
        const midY = (nodeA.y + nodeB.y) / 2;

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;

        // Formatação Numérica Compacta (Max 1 decimal, remove .0)
        const formattedValue = parseFloat(val.toFixed(1));

        // Etiqueta Minimalista
        const forceLabel = new Konva.Label({
            x: midX,
            y: midY,
            rotation: angle,
            listening: false
        });

        forceLabel.add(new Konva.Tag({
            fill: 'white',
            cornerRadius: 3,
            stroke: strokeColor,
            strokeWidth: 1,
            opacity: 0.9,
            shadowColor: 'black',
            shadowBlur: 2,
            shadowOpacity: 0.1,
            shadowOffsetY: 1
        }));

        const textNode = new Konva.Text({
            text: `${formattedValue} N`,
            fontSize: 11,
            fontStyle: 'bold',
            fill: strokeColor,
            padding: 2,
            align: 'center'
        });

        forceLabel.add(textNode);

        // Centraliza o label
        forceLabel.offsetX(textNode.width() / 2);
        forceLabel.offsetY(textNode.height() / 2);

        resultsLayer.add(forceLabel);
    }

    // Renderização das Reações (Mantida Original, mas ajustada para não conflitar)
    for (const reaction of reacoesApoio) {
        const node = nodeMap.get(reaction.IdNo);
        if (!node) continue;

        // ... (Código de reações mantido simplificado ou igual)
        // Vou manter o código original das reações para não remover funcionalidade não solicitada
        // mas vou copiar o bloco original das reações aqui para garantir que a função fique completa.

        if (Math.abs(reaction.Rx ?? 0) > 0.01) {
            const arrowDir = reaction.Rx > 0 ? 1 : -1;
            const rxArrow = new Konva.Arrow({
                points: [node.x, node.y, node.x + 40 * arrowDir, node.y], // Encurtado um pouco
                pointerLength: 8,
                pointerWidth: 8,
                fill: VISUAL_THEME.reaction.stroke,
                stroke: VISUAL_THEME.reaction.stroke,
                strokeWidth: 2,
                listening: false
            });

            const rxLabel = new Konva.Text({
                x: node.x + 45 * arrowDir,
                y: node.y - 10,
                text: `Rx: ${Math.abs(reaction.Rx).toFixed(1)}`,
                fontSize: 11,
                fill: VISUAL_THEME.labelText,
                fontStyle: 'bold'
            });
            if (arrowDir < 0) rxLabel.offsetX(rxLabel.width()); // Ajusta alinhamento se for pra esquerda

            resultsLayer.add(rxArrow, rxLabel);
        }

        if (Math.abs(reaction.Ry ?? 0) > 0.01) {
            const arrowDir = reaction.Ry > 0 ? -1 : 1; // Y do Konva é invertido? Não, Ry positivo é pra cima geralmente, mas aqui desenhamos seta.
            // No código original: reaction.Ry > 0 ? -1 : 1. (Seta pra cima se Ry > 0).

            const ryArrow = new Konva.Arrow({
                points: [node.x, node.y, node.x, node.y + 40 * arrowDir],
                pointerLength: 8,
                pointerWidth: 8,
                fill: VISUAL_THEME.reaction.stroke,
                stroke: VISUAL_THEME.reaction.stroke,
                strokeWidth: 2,
                listening: false
            });

            const ryLabel = new Konva.Text({
                x: node.x + 5,
                y: node.y + (arrowDir > 0 ? 10 : -25),
                text: `Ry: ${Math.abs(reaction.Ry).toFixed(1)}`,
                fontSize: 11,
                fill: VISUAL_THEME.labelText,
                fontStyle: 'bold'
            });

            resultsLayer.add(ryArrow, ryLabel);
        }
    }

    memberLayer.draw();
    resultsLayer.draw();
    idLayer.draw();
}

// ==========================================================
// VISUALIZAÇÃO DE ÂNGULOS ENTRE BARRAS
// ==========================================================
function updateAngles() {
    angleLayer.destroyChildren();

    nodes.forEach(node => {
        // Encontra barras conectadas a este nó
        const connectedMembers = members.filter(m => m.startNodeId === node.id || m.endNodeId === node.id);

        if (connectedMembers.length < 2) return; // Precisa de pelo menos 2 barras para formar um ângulo

        // Calcula o ângulo absoluto de cada barra saindo do nó
        const memberAngles = connectedMembers.map(m => {
            const otherNodeId = (m.startNodeId === node.id) ? m.endNodeId : m.startNodeId;
            const otherNode = nodes.find(n => n.id === otherNodeId);

            // Ângulo em radianos (-PI a PI)
            // Inverte Y do Konva para cálculo matemático padrão (Y cresce para cima na matemática, para baixo no canvas)
            const dx = otherNode.x - node.x;
            const dy = -(otherNode.y - node.y);
            let angle = Math.atan2(dy, dx);

            // Normaliza para 0 a 2PI
            if (angle < 0) angle += 2 * Math.PI;

            return { member: m, angle: angle };
        });

        // Ordena por ângulo (Crescente)
        memberAngles.sort((a, b) => a.angle - b.angle);

        // Calcula e desenha os ângulos entre barras adjacentes
        for (let i = 0; i < memberAngles.length; i++) {
            const current = memberAngles[i];
            const next = memberAngles[(i + 1) % memberAngles.length]; // Próximo (circular)

            let diff = next.angle - current.angle;
            if (diff < 0) diff += 2 * Math.PI; // Caso passe pelo 0 (360)

            // Filtragem Visual: Apenas ângulos internos (< 180 graus)
            // Usamos um pequeno epsilon para evitar imprecisões de float (ex: 179.99)
            if (diff > Math.PI - 0.001) continue;

            // --- Renderização ---

            // Conversão para sistema do Konva (Y invertido)
            // Math angle A -> Konva rotation = -A
            // Sweep angle (diff) -> Konva angle = -diff (para varrer no sentido horário visualmente se partirmos do vetor matemático?)
            // Na verdade:
            // Math: Vetor 1 está em A. Vetor 2 está em A + diff.
            // Konva: Vetor 1 está em -A. Vetor 2 está em -(A+diff) = -A - diff.
            // Então se começarmos em -A (rotação), precisamos varrer -diff.

            const startAngleDeg = - (current.angle * 180 / Math.PI);
            const diffDeg = - (diff * 180 / Math.PI);

            const radius = 20; // Raio pequeno e discreto

            // Arco removido conforme solicitação
            /*
            const arc = new Konva.Arc({
                x: node.x,
                y: node.y,
                innerRadius: radius, 
                outerRadius: radius,
                angle: diffDeg,
                rotation: startAngleDeg,
                stroke: '#607d8b',
                strokeWidth: 1.5,
                listening: false
            });
            angleLayer.add(arc);
            */

            // Texto do ângulo
            const midAngle = current.angle + diff / 2;
            const textRadius = radius + 12; // Um pouco mais afastado que o arco
            const tx = node.x + textRadius * Math.cos(midAngle);
            const ty = node.y - textRadius * Math.sin(midAngle); // Y invertido

            const angleValueDeg = diff * 180 / Math.PI;

            const label = new Konva.Text({
                x: tx,
                y: ty,
                text: `${angleValueDeg.toFixed(0)}°`,
                fontSize: 10,
                fill: '#007bff', // Azul
                align: 'center'
            });

            // Centraliza o texto no ponto calculado
            label.offsetX(label.width() / 2);
            label.offsetY(label.height() / 2);

            angleLayer.add(label);
        }
    });

    angleLayer.batchDraw();
}

function resetAnalysisDisplay(keepResultsContent = false) {
    for (const member of members) {
        if (member.konvaLine) {
            member.konvaLine.stroke('black');
            member.konvaLine.shadowOpacity(0);
            member.konvaLine.strokeWidth(3);
        }
    }
    memberLayer.batchDraw();
    resultsLayer.destroyChildren();
    resultsLayer.batchDraw();

    idLayer.show();
    nodes.forEach(n => n.konvaIdText.show());
    members.forEach(m => { if (m.konvaIdText) m.konvaIdText.hide(); }); // Mantém oculto no reset
    idLayer.batchDraw();

    if (!keepResultsContent) {
        const resultsDiv = document.getElementById("results");
        if (resultsDiv) {
            resultsDiv.innerHTML = RESULTS_PLACEHOLDER_HTML;
        }
    }
}

// ==========================================================
// FUNÇÕES AUXILIARES (Grid)
// ==========================================================
function drawGrid() {
    gridLayer.destroyChildren();

    const totalWidth = gridConfig.dx * gridConfig.nx;
    const totalHeight = gridConfig.dy * gridConfig.ny;

    // Centraliza o grid no canvas com Auto-Zoom
    const padding = 40;
    const scaleX = (CANVAS_WIDTH - padding) / totalWidth;
    const scaleY = (CANVAS_HEIGHT - padding) / totalHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Não dá zoom in, apenas out se necessário

    // NOTA: Com o novo sistema de Zoom/Pan, talvez não devêssemos resetar o scale aqui sempre.
    // Mas como essa função é chamada no início e no reset, ok.
    stage.scale({ x: scale, y: scale });

    // Recalcula startX/Y considerando o scale (espaço do mundo)
    const startX = (CANVAS_WIDTH / scale - totalWidth) / 2;
    const startY = (CANVAS_HEIGHT / scale - totalHeight) / 2;

    // Salva as bordas do grid para uso no snap
    gridConfig.startX = startX;
    gridConfig.startY = startY;
    gridConfig.endX = startX + totalWidth;
    gridConfig.endY = startY + totalHeight;

    // Desenha linhas verticais
    for (let i = 0; i <= gridConfig.nx; i++) {
        const x = startX + (i * gridConfig.dx);
        gridLayer.add(new Konva.Line({
            points: [x, startY, x, startY + totalHeight],
            stroke: '#e9ecef', strokeWidth: 1
        }));
    }

    // Desenha linhas horizontais
    for (let j = 0; j <= gridConfig.ny; j++) {
        const y = startY + (j * gridConfig.dy);
        gridLayer.add(new Konva.Line({
            points: [startX, y, startX + totalWidth, y],
            stroke: '#e9ecef', strokeWidth: 1
        }));
    }

    // Desenha borda externa mais forte
    gridLayer.add(new Konva.Rect({
        x: startX, y: startY, width: totalWidth, height: totalHeight,
        stroke: '#999', strokeWidth: 2, listening: false
    }));

    gridLayer.batchDraw();
}

function snapToGrid(pos) {
    // Ajusta a posição relativa ao início do grid
    const relativeX = pos.x - gridConfig.startX;
    const relativeY = pos.y - gridConfig.startY;

    // Encontra o índice do grid mais próximo
    let ix = Math.round(relativeX / gridConfig.dx);
    let iy = Math.round(relativeY / gridConfig.dy);

    // Clampa os índices para ficar dentro do grid
    if (ix < 0) ix = 0;
    if (ix > gridConfig.nx) ix = gridConfig.nx;
    if (iy < 0) iy = 0;
    if (iy > gridConfig.ny) iy = gridConfig.ny;

    // Calcula a posição absoluta
    const snappedX = gridConfig.startX + (ix * gridConfig.dx);
    const snappedY = gridConfig.startY + (iy * gridConfig.dy);

    return { x: snappedX, y: snappedY };
}

// ==========================================================
// INICIALIZAÇÃO E CONFIGURAÇÃO
// ==========================================================

function openGridConfig() {
    // Preenche o modal com os valores atuais
    document.getElementById('gridHSpacing').value = gridConfig.dx;
    document.getElementById('gridHCount').value = gridConfig.nx;
    document.getElementById('gridVSpacing').value = gridConfig.dy;
    document.getElementById('gridVCount').value = gridConfig.ny;

    const myModal = new bootstrap.Modal(document.getElementById('gridConfigModal'), {});
    myModal.show();
}

function applyGridSettings() {
    const dx = parseInt(document.getElementById('gridHSpacing').value);
    const nx = parseInt(document.getElementById('gridHCount').value);
    const dy = parseInt(document.getElementById('gridVSpacing').value);
    const ny = parseInt(document.getElementById('gridVCount').value);

    if (isNaN(dx) || dx < 10 || isNaN(nx) || nx < 1 || isNaN(dy) || dy < 10 || isNaN(ny) || ny < 1) {
        alert("Por favor, insira valores válidos para o grid.");
        return;
    }

    // Se houver nós desenhados, exige confirmação para limpar tudo
    if (nodes.length > 0) {
        // O alerta já está no modal, mas vamos confirmar via JS também se o usuário não leu
        // Na verdade, como é uma mudança drástica de coordenadas, é melhor limpar sempre.
        // O modal já avisa "Redefinir o grid apagará todo o desenho atual".
        resetCanvas();
    }

    gridConfig.dx = dx;
    gridConfig.nx = nx;
    gridConfig.dy = dy;
    gridConfig.ny = ny;

    drawGrid();

    // Fecha o modal
    const modalElement = document.getElementById('gridConfigModal');
    const modal = bootstrap.Modal.getInstance(modalElement);
    if (modal) modal.hide();
}

// ==========================================================
// GERADOR DE TRELIÇAS (TEMPLATES) - REMOVIDO
// ==========================================================

// Mostra o modal ao carregar a página
window.addEventListener('load', function () {
    // Abre o modal de configuração diretamente
    // openGridConfig(); // Comentado para não abrir sempre
    validateTrussStatus(); // Validação inicial
});

// ==========================================================
// GERADOR DE TRELIÇAS (TEMPLATES)
// ==========================================================

let templateStage = null;
let templateLayer = null;

// Configura o listener do modal de templates na inicialização
window.addEventListener('load', function () {
    const templateModalEl = document.getElementById('templateModal');
    if (templateModalEl) {
        templateModalEl.addEventListener('shown.bs.modal', function () {
            // Pequeno delay para garantir que o layout (tamanho do div) esteja estável
            setTimeout(() => {
                initTemplatePreview();
                updateTemplatePreview();
            }, 50);
        });
    }
});

// Função openTemplateModal removida pois o botão usa data-bs-toggle
// function openTemplateModal() { ... }

function initTemplatePreview() {
    const container = document.getElementById('template-preview');
    if (!container) return;

    // Se já existe, destrói para recriar (garante tamanho correto)
    if (templateStage) {
        templateStage.destroy();
    }

    templateStage = new Konva.Stage({
        container: 'template-preview',
        width: container.clientWidth,
        height: container.clientHeight,
        draggable: false,
        pixelRatio: window.devicePixelRatio || 1 // High DPI Scaling
    });

    templateLayer = new Konva.Layer();
    templateStage.add(templateLayer);
}

function updateTemplatePreview() {
    if (!templateLayer) return;
    templateLayer.destroyChildren();

    // Reset scale/position to clear previous transforms
    templateLayer.scale({ x: 1, y: 1 });
    templateLayer.position({ x: 0, y: 0 });

    const type = document.getElementById('trussType').value;
    const stageWidth = templateStage.width();
    const stageHeight = templateStage.height();

    // Dimensões "Reais" (Baseadas no gerador padrão: 6 vãos de 60px)
    const realBayWidth = 60;
    const realHeight = 60;
    const bays = 6;
    const realWidth = realBayWidth * bays;

    // Margem de segurança no preview
    const padding = 40;
    const availableWidth = stageWidth - padding;
    const availableHeight = stageHeight - padding;

    // Fator de Escala (Fit-to-View)
    // Calcula quanto precisamos escalar para caber na área disponível
    // Se a área for maior, ele vai aumentar (zoom in). Se for menor, diminuir (zoom out).
    const scaleX = availableWidth / realWidth;
    const scaleY = availableHeight / realHeight;
    const scale = Math.min(scaleX, scaleY); // Mantém proporção (aspect ratio)

    // Centralização
    // A treliça desenhada começará em (0,0) localmente.
    // Precisamos posicionar o layer de forma que o centro da treliça escalada coincida com o centro do stage.
    const finalWidth = realWidth * scale;
    const finalHeight = realHeight * scale;

    const posX = (stageWidth - finalWidth) / 2;
    const posY = (stageHeight - finalHeight) / 2;

    templateLayer.scale({ x: scale, y: scale });
    templateLayer.position({ x: posX, y: posY });

    // Desenha a treliça na origem (0,0) do layer
    drawTemplateTruss(templateLayer, type, 0, 0, realWidth, realHeight, bays);

    templateLayer.batchDraw();
}

function drawTemplateTruss(layer, type, startX, startY, width, height, bays) {
    const bayWidth = width / bays;

    // Estilo
    const strokeColor = '#0d6efd';
    const strokeWidth = 2;
    const nodeRadius = 3;
    const nodeColor = '#198754';

    if (type === 'warren') {
        // --- LÓGICA WARREN (TRIANGULAR / ZIG-ZAG) ---

        // 1. Nós Inferiores (0 a bays)
        for (let i = 0; i <= bays; i++) {
            const x = startX + (i * bayWidth);
            layer.add(new Konva.Circle({ x: x, y: startY + height, radius: nodeRadius, fill: nodeColor }));
        }

        // 2. Nós Superiores (Deslocados - 0 a bays-1)
        for (let i = 0; i < bays; i++) {
            const x = startX + (i * bayWidth) + (bayWidth / 2);
            layer.add(new Konva.Circle({ x: x, y: startY, radius: nodeRadius, fill: nodeColor }));
        }

        // 3. Banzo Inferior
        layer.add(new Konva.Line({ points: [startX, startY + height, startX + width, startY + height], stroke: strokeColor, strokeWidth: strokeWidth }));

        // 4. Banzo Superior
        // O banzo superior vai do primeiro nó superior ao último nó superior
        const xStartTop = startX + (bayWidth / 2);
        const xEndTop = startX + width - (bayWidth / 2);
        layer.add(new Konva.Line({ points: [xStartTop, startY, xEndTop, startY], stroke: strokeColor, strokeWidth: strokeWidth }));

        // 5. Diagonais
        for (let i = 0; i < bays; i++) {
            const xBot1 = startX + (i * bayWidth);
            const xTop = startX + (i * bayWidth) + (bayWidth / 2);
            const xBot2 = startX + ((i + 1) * bayWidth);

            const yTop = startY;
            const yBot = startY + height;

            // Sobe
            layer.add(new Konva.Line({ points: [xBot1, yBot, xTop, yTop], stroke: strokeColor, strokeWidth: strokeWidth }));
            // Desce
            layer.add(new Konva.Line({ points: [xTop, yTop, xBot2, yBot], stroke: strokeColor, strokeWidth: strokeWidth }));
        }

    } else {
        // --- LÓGICA PRATT / HOWE (RETANGULAR) ---

        // Nós inferiores e superiores
        for (let i = 0; i <= bays; i++) {
            const x = startX + (i * bayWidth);

            // Inferior
            layer.add(new Konva.Circle({ x: x, y: startY + height, radius: nodeRadius, fill: nodeColor }));

            // Superior
            layer.add(new Konva.Circle({ x: x, y: startY, radius: nodeRadius, fill: nodeColor }));

            // Montantes Verticais (Sempre presentes)
            layer.add(new Konva.Line({ points: [x, startY, x, startY + height], stroke: strokeColor, strokeWidth: strokeWidth }));
        }

        // Cordas (Banzo Superior e Inferior)
        layer.add(new Konva.Line({ points: [startX, startY, startX + width, startY], stroke: strokeColor, strokeWidth: strokeWidth }));
        layer.add(new Konva.Line({ points: [startX, startY + height, startX + width, startY + height], stroke: strokeColor, strokeWidth: strokeWidth }));

        // Diagonais
        for (let i = 0; i < bays; i++) {
            const x1 = startX + (i * bayWidth);
            const x2 = startX + ((i + 1) * bayWidth);
            const yTop = startY;
            const yBot = startY + height;

            if (type === 'pratt') {
                const centerBay = bays / 2;
                if (i < centerBay) {
                    layer.add(new Konva.Line({ points: [x1, yTop, x2, yBot], stroke: strokeColor, strokeWidth: strokeWidth }));
                } else {
                    layer.add(new Konva.Line({ points: [x2, yTop, x1, yBot], stroke: strokeColor, strokeWidth: strokeWidth }));
                }
            } else if (type === 'howe') {
                const centerBay = bays / 2;
                if (i < centerBay) {
                    layer.add(new Konva.Line({ points: [x1, yBot, x2, yTop], stroke: strokeColor, strokeWidth: strokeWidth }));
                } else {
                    layer.add(new Konva.Line({ points: [x2, yBot, x1, yTop], stroke: strokeColor, strokeWidth: strokeWidth }));
                }
            }
        }
    }
}

function generateTrussFromTemplate() {
    const type = document.getElementById('trussType').value;

    const numBays = 6;

    // --- LÓGICA DE ESCALA ROBUSTA (FAIL-SAFE) ---

    // 1. Definição do Espaçamento Base (Grid Virtual)
    // Tenta ler do gridConfig global, senão usa 50
    const gridSnap = (typeof gridConfig !== 'undefined' && gridConfig.dx) ? gridConfig.dx : 50;

    // 2. Cálculo da Largura do Vão (Bay Width)
    // Obtenha a largura do canvas (com fallback)
    const stageW = stage.width() || 800;
    const stageH = stage.height() || 600;

    // Defina uma largura alvo (70% da tela)
    const targetTotalW = stageW * 0.7;

    // Calcule o tamanho bruto do vão
    let calculatedBayW = targetTotalW / numBays;

    // 3. Sanatização e Snapping (Segurança)
    // Garante que não seja muito pequeno (Aumentado para 120px para evitar cluttering)
    if (calculatedBayW < 120) calculatedBayW = 120;

    // Arredonde para o múltiplo do grid mais próximo (para alinhar com as linhas)
    const slots = Math.round(calculatedBayW / gridSnap);
    const finalBayWidth = Math.max(1, slots) * gridSnap;

    // 4. Definição da Altura (Proporção 1:1)
    const finalTrussHeight = finalBayWidth;

    // Mapeando para as variáveis usadas no loop
    const BAY_WIDTH = finalBayWidth;
    const TRUSS_HEIGHT = finalTrussHeight;

    // Limpa o canvas atual
    forceResetCanvas(false);

    // Força a escala para 1:1 e posição 0,0
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });

    // 5. Geração e Centralização
    const totalW = finalBayWidth * numBays;

    // Centraliza DENTRO do Grid (usando as coordenadas calculadas pelo drawGrid)
    let startX, startY;

    if (typeof gridConfig !== 'undefined' && typeof gridConfig.startX === 'number') {
        const gridW = gridConfig.dx * gridConfig.nx;
        const gridH = gridConfig.dy * gridConfig.ny;

        startX = gridConfig.startX + (gridW - totalW) / 2;
        startY = gridConfig.startY + (gridH - finalTrussHeight) / 2;
    } else {
        // Fallback para o centro do Stage se o grid não estiver configurado
        startX = (stageW - totalW) / 2;
        startY = (stageH - finalTrussHeight) / 2;
    }

    // Gera os nós e barras
    let nodesMap = {}; // "x,y" -> nodeObject

    function getOrCreateNode(x, y) {
        // Arredonda para evitar problemas de float
        const rx = Math.round(x * 100) / 100;
        const ry = Math.round(y * 100) / 100;
        const key = `${rx},${ry}`;
        if (nodesMap[key]) return nodesMap[key];

        const node = findOrCreateNodeAt({ x: rx, y: ry });
        nodesMap[key] = node;
        return node;
    }

    // Separação de Lógica: Warren (Triangular) vs Pratt/Howe (Retangular)
    if (type === 'warren') {
        // --- LÓGICA WARREN (ZIG-ZAG / TRIÂNGULOS) ---

        // 1. Nós Inferiores (0 a numBays)
        for (let i = 0; i <= numBays; i++) {
            const x = startX + (i * BAY_WIDTH);
            getOrCreateNode(x, startY + TRUSS_HEIGHT);
        }

        // 2. Nós Superiores (Deslocados - 0 a numBays-1)
        for (let i = 0; i < numBays; i++) {
            const x = startX + (i * BAY_WIDTH) + (BAY_WIDTH / 2);
            getOrCreateNode(x, startY);
        }

        // 3. Barras Horizontais Inferiores
        for (let i = 0; i < numBays; i++) {
            const n1 = getOrCreateNode(startX + i * BAY_WIDTH, startY + TRUSS_HEIGHT);
            const n2 = getOrCreateNode(startX + (i + 1) * BAY_WIDTH, startY + TRUSS_HEIGHT);
            createMember(n1, n2);
        }

        // 4. Barras Horizontais Superiores
        for (let i = 0; i < numBays - 1; i++) {
            const n1 = getOrCreateNode(startX + i * BAY_WIDTH + (BAY_WIDTH / 2), startY);
            const n2 = getOrCreateNode(startX + (i + 1) * BAY_WIDTH + (BAY_WIDTH / 2), startY);
            createMember(n1, n2);
        }

        // 5. Diagonais (Zigue-Zague)
        for (let i = 0; i < numBays; i++) {
            const nBot1 = getOrCreateNode(startX + i * BAY_WIDTH, startY + TRUSS_HEIGHT);
            const nTop = getOrCreateNode(startX + i * BAY_WIDTH + (BAY_WIDTH / 2), startY);
            const nBot2 = getOrCreateNode(startX + (i + 1) * BAY_WIDTH, startY + TRUSS_HEIGHT);

            createMember(nBot1, nTop); // Sobe
            createMember(nTop, nBot2); // Desce
        }

    } else {
        // --- LÓGICA PRATT / HOWE (RETANGULAR) ---

        // Cria nós e barras horizontais (Banzos) e Verticais
        for (let colIndex = 0; colIndex <= numBays; colIndex++) {
            const x = startX + (colIndex * BAY_WIDTH);

            // Nós
            const nBot = getOrCreateNode(x, startY + TRUSS_HEIGHT);
            const nTop = getOrCreateNode(x, startY);

            // Barras Horizontais
            if (colIndex > 0) {
                const prevX = startX + ((colIndex - 1) * BAY_WIDTH);
                const prevNTop = getOrCreateNode(prevX, startY);
                const prevNBot = getOrCreateNode(prevX, startY + TRUSS_HEIGHT);

                createMember(prevNTop, nTop);
                createMember(prevNBot, nBot);
            }

            // Verticais (Sempre presentes no Pratt/Howe)
            createMember(nBot, nTop);
        }

        // Diagonais
        for (let i = 0; i < numBays; i++) {
            const x1 = startX + (i * BAY_WIDTH);
            const x2 = startX + ((i + 1) * BAY_WIDTH);

            const nTop1 = getOrCreateNode(x1, startY);
            const nBot1 = getOrCreateNode(x1, startY + TRUSS_HEIGHT);
            const nTop2 = getOrCreateNode(x2, startY);
            const nBot2 = getOrCreateNode(x2, startY + TRUSS_HEIGHT);

            if (type === 'pratt') {
                const centerBay = numBays / 2;
                if (i < centerBay) {
                    createMember(nTop1, nBot2); // \
                } else {
                    createMember(nTop2, nBot1); // /
                }
            } else if (type === 'howe') {
                const centerBay = numBays / 2;
                if (i < centerBay) {
                    createMember(nBot1, nTop2); // /
                } else {
                    createMember(nBot2, nTop1); // \
                }
            }
        }
    }

    // Adiciona apoios padrão (Fixo na esquerda, Móvel na direita)
    const firstNodeBot = getOrCreateNode(startX, startY + TRUSS_HEIGHT);
    const lastNodeBot = getOrCreateNode(startX + (numBays * BAY_WIDTH), startY + TRUSS_HEIGHT);

    addSupport(firstNodeBot.id, 'Pinned');
    addSupport(lastNodeBot.id, 'Roller_Y');

    // Fecha o modal
    const modalElement = document.getElementById('templateModal');
    const modal = bootstrap.Modal.getInstance(modalElement);
    if (modal) modal.hide();

    // Atualiza visualização
    memberLayer.batchDraw();
    nodeLayer.batchDraw();
    idLayer.batchDraw();
    gridLayer.batchDraw(); // Redesenha o grid caso tenha mudado algo

    // --- Centralizar Grid após gerar Template ---
    stage.scale({ x: 1, y: 1 }); // Reseta Zoom

    // Calcula dimensões do grid (usando gridConfig)
    const totalGridW = gridConfig.dx * gridConfig.nx;
    const totalGridH = gridConfig.dy * gridConfig.ny;

    // Centraliza
    const centerX = (stage.width() - totalGridW) / 2;
    const centerY = (stage.height() - totalGridH) / 2;

    stage.position({ x: centerX, y: centerY });
    stage.batchDraw();
}


// ==========================================================
// VALIDAÇÃO ESTRUTURAL (DIAGNÓSTICO)
// ==========================================================
function validateTrussStatus() {
    try {
        // 1. Contadores
        const n = nodes.length;
        const b = members.length;
        let r = 0;
        supports.forEach(s => {
            if (s.type === 0) r += 2; // Pinned (Fixo) = 2 reações
            else if (s.type === 2) r += 1; // Roller (Móvel) = 1 reação
        });
        const loadCount = loads.length;

        // Atualiza HUD
        const elNodes = document.getElementById('val-count-nodes');
        const elMembers = document.getElementById('val-count-members');
        const elReactions = document.getElementById('val-count-reactions');

        if (elNodes) elNodes.innerText = n;
        if (elMembers) elMembers.innerText = b;
        if (elReactions) elReactions.innerText = r;

        // 2. Critério de Maxwell e Diagnóstico Inteligente
        const I = b + r; // Incógnitas
        const E = 2 * n; // Equações
        const diferenca = E - I; // Déficit de restrições (se > 0, falta travar)

        const statusDiv = document.getElementById('validation-status');
        if (statusDiv) {
            let statusHtml = `<div class="mb-1">Incógnitas: <strong>${I}</strong> vs Equações: <strong>${E}</strong></div>`;
            const solveBtn = document.getElementById('solveButton');
            let isReady = false;

            if (n === 0) {
                statusDiv.className = 'alert alert-secondary p-2 mb-2 small';
                statusDiv.innerHTML = 'Aguardando modelo...';
                isReady = false;
            }
            // Caso 1: Apoios Insuficientes
            else if (r < 3) {
                statusDiv.className = 'alert alert-danger p-2 mb-2 small';
                statusHtml += `<div><strong>⚠️ Instável:</strong> Faltam apoios.<br>O mínimo necessário são 3 reações (ex: 1 Fixo + 1 Móvel).</div>`;
                statusDiv.innerHTML = statusHtml;
                isReady = false;
            }
            // Caso 2: Hipostática / Instável (diferenca > 0)
            else if (diferenca > 0) {
                statusDiv.className = 'alert alert-danger p-2 mb-2 small';
                statusHtml += `<div><strong>🔴 Instável (Hipostática):</strong> O sistema possui <strong>${diferenca}</strong> graus de liberdade soltos.<br>Adicione <strong>${diferenca}</strong> barras (ou apoios) para travar a estrutura.</div>`;
                statusDiv.innerHTML = statusHtml;
                isReady = false;
            }
            // Caso 3: Hiperestática (diferenca < 0)
            else if (diferenca < 0) {
                statusDiv.className = 'alert alert-warning p-2 mb-2 small';
                const grauHiper = Math.abs(diferenca);
                statusHtml += `<div><strong>🔵 Hiperestática:</strong> A estrutura possui <strong>${grauHiper}</strong> barras a mais do que o necessário para o equilíbrio estático.<br>O cálculo pode ser mais complexo.</div>`;
                statusDiv.innerHTML = statusHtml;
                isReady = true; // Geralmente solvers FEM resolvem hiperestáticas, mas depende do backend. Assumindo que sim.
            }
            // Caso 4: Isostática (diferenca === 0 E r >= 3)
            else {
                statusDiv.className = 'alert alert-success p-2 mb-2 small';
                statusHtml += `<div><strong>✅ Sucesso:</strong> Estrutura isostática e estável.<br>Pronta para cálculo.</div>`;
                statusDiv.innerHTML = statusHtml;
                isReady = true;
            }

            if (solveBtn) solveBtn.disabled = !isReady;
        }

        // 3. Checklist
        updateCheckItem('check-min-members', b >= 3, `${b}/3`);
        updateCheckItem('check-loads', loadCount > 0, `${loadCount}`);
        updateCheckItem('check-supports', r >= 3, `${r}`);

    } catch (e) {
        console.error("Erro na validação da treliça:", e);
    }
}

function updateCheckItem(id, isValid, text) {
    const li = document.getElementById(id);
    if (!li) return;
    const icon = li.querySelector('i');
    const span = li.querySelector('span');

    if (isValid) {
        li.className = 'text-success fw-bold';
        if (icon) icon.className = 'bi bi-check-circle-fill me-1';
    } else {
        li.className = 'text-muted';
        if (icon) icon.className = 'bi bi-circle me-1';
    }
    if (span) span.innerText = text;
}