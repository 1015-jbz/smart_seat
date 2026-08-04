import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const fonts = [
  { id: 'default', name: '默认', family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" },
  { id: 'serif', name: '思源宋体', family: "'Noto Serif SC', 'SimSun', 'STSong', 'KaiTi', serif" },
  { id: 'art', name: '站酷快乐体', family: "'ZCOOL KuaiLe', 'KaiTi', 'STKaiti', cursive" },
];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [fontId, setFontId] = useState(() => localStorage.getItem('font') || 'default');

  const currentFont = fonts.find(f => f.id === fontId) || fonts[0];

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-family', currentFont.family);
    localStorage.setItem('font', fontId);
  }, [fontId, currentFont.family]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, fonts, fontId, setFontId, currentFont }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
