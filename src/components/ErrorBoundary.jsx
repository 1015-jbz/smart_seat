import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * 全局错误边界：捕获子树渲染异常，避免整页白屏。
 * 生产环境应将 error 上报到监控平台（预留接口）。
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // 预留：接入 Sentry / 自建日志服务
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || '未知错误';

    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: '60vh', padding: 32, textAlign: 'center' }}>
        <AlertTriangle size={56} style={{ color: 'var(--color-danger)', opacity: 0.6, marginBottom: 16 }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-main)', marginBottom: 8 }}>
          页面出现异常
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-sub)', maxWidth: 420, marginBottom: 4, wordBreak: 'break-all' }}>
          {msg}
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>
          可尝试重置当前视图，或返回首页继续使用。
        </p>
        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(79,140,255,0.3)',
            }}
          >
            <RotateCcw size={14} /> 重置视图
          </button>
          <a
            href="#/"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-sub)',
            }}
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }
}
