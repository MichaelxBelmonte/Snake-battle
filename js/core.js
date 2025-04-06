class GameCore {
    constructor() {
        console.log('Inizializzazione GameCore...');
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            console.error('Canvas non trovato!');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            console.error('Contesto 2D non supportato!');
            return;
        }
        
        this.gridSize = 30;
        this.cellSize = 0;
        
        this.setupCanvas();
        window.addEventListener('resize', () => this.setupCanvas());
        
        console.log('GameCore inizializzato con successo');
    }
    
    setupCanvas() {
        console.log('Configurazione canvas...');
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        this.cellSize = Math.min(
            this.canvas.width / this.gridSize,
            this.canvas.height / this.gridSize
        );
        
        this.clear();
        this.drawGrid();
        
        console.log(`Canvas configurato: ${this.canvas.width}x${this.canvas.height}, cellSize: ${this.cellSize}`);
    }
    
    clear() {
        this.ctx.fillStyle = '#0077be';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawGrid() {
        const offsetX = (this.canvas.width - this.cellSize * this.gridSize) / 2;
        const offsetY = (this.canvas.height - this.cellSize * this.gridSize) / 2;
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 0.5;
        
        for (let i = 0; i <= this.gridSize; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(offsetX + i * this.cellSize, offsetY);
            this.ctx.lineTo(offsetX + i * this.cellSize, offsetY + this.gridSize * this.cellSize);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(offsetX, offsetY + i * this.cellSize);
            this.ctx.lineTo(offsetX + this.gridSize * this.cellSize, offsetY + i * this.cellSize);
            this.ctx.stroke();
        }
    }
    
    drawSnake(snake) {
        const offsetX = (this.canvas.width - this.cellSize * this.gridSize) / 2;
        const offsetY = (this.canvas.height - this.cellSize * this.gridSize) / 2;
        
        snake.segments.forEach((segment, index) => {
            this.ctx.fillStyle = snake.color;
            
            this.ctx.fillRect(
                offsetX + segment.x * this.cellSize,
                offsetY + segment.y * this.cellSize,
                this.cellSize,
                this.cellSize
            );
            
            if (index === 0) {
                this.ctx.fillStyle = this.lightenColor(snake.color, 30);
            } else {
                this.ctx.fillStyle = this.lightenColor(snake.color, 10);
            }
            
            this.ctx.fillRect(
                offsetX + segment.x * this.cellSize + 2,
                offsetY + segment.y * this.cellSize + 2,
                this.cellSize - 4,
                this.cellSize - 4
            );
        });
    }
    
    drawFood(food) {
        const offsetX = (this.canvas.width - this.cellSize * this.gridSize) / 2;
        const offsetY = (this.canvas.height - this.cellSize * this.gridSize) / 2;
        
        this.ctx.fillStyle = '#ffff00';
        this.ctx.fillRect(
            offsetX + food.position.x * this.cellSize,
            offsetY + food.position.y * this.cellSize,
            this.cellSize,
            this.cellSize
        );
    }
    
    drawPowerUp(powerUp) {
        const offsetX = (this.canvas.width - this.cellSize * this.gridSize) / 2;
        const offsetY = (this.canvas.height - this.cellSize * this.gridSize) / 2;
        
        const color = powerUp.type === 'speed' ? '#00ff00' : '#ff00ff';
        this.ctx.fillStyle = color;
        
        const centerX = offsetX + (powerUp.position.x + 0.5) * this.cellSize;
        const centerY = offsetY + (powerUp.position.y + 0.5) * this.cellSize;
        const size = this.cellSize * 0.4;
        
        this.ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const x = centerX + Math.cos(angle) * size;
            const y = centerY + Math.sin(angle) * size;
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (
            0x1000000 +
            (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)
        ).toString(16).slice(1);
    }
}

window.gameCore = new GameCore(); 