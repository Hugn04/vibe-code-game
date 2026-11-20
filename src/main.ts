import './styles.css';
import { Game } from '@/core/Game';

const container = document.getElementById('app');
if (!container) throw new Error('Không tìm thấy phần tử #app');

const game = new Game(container);
game.start();

// Truy cập từ DevTools khi dev: window.game
if (import.meta.env.DEV) {
  (window as unknown as { game: Game }).game = game;
}

// Hot reload khi dev: hủy game cũ trước khi module mới chạy.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
