export function Footer() {
  return (
    <footer className="w-full py-12 text-center text-sm text-muted-foreground border-t border-border/40 bg-background/50 mt-12">
      <div className="flex justify-center items-center gap-8 mb-6">
        <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
          ExhiBeat
        </span>
        <div className="flex gap-6">
          <a href="#" className="hover:text-foreground transition-colors">關於我們</a>
          <a href="#" className="hover:text-foreground transition-colors">服務條款</a>
          <a href="#" className="hover:text-foreground transition-colors">隱私政策</a>
          <a href="#" className="hover:text-foreground transition-colors">聯繫藝術家</a>
        </div>
      </div>
      <p className="mb-4">© 2024 ExhiBeat. 展演台北</p>
      <div className="flex justify-center gap-4">
        <a href="#" className="hover:text-foreground transition-colors">🌐</a>
        <a href="#" className="hover:text-foreground transition-colors">✉️</a>
      </div>
    </footer>
  );
}
