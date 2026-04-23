export function Footer() {
  return (
    <footer className="w-full py-12 mt-12 text-center text-sm text-muted-foreground border-t border-[#48474d]/20 bg-background">
      <div className="flex flex-col justify-center items-center gap-6 mb-4">
        <span className="text-3xl font-extrabold font-headline bg-clip-text text-transparent bg-gradient-to-br from-[#df8eff] to-[#d878ff] tracking-tight">
          ExhiBeat
        </span>
        <div className="flex gap-6">
          <a href="#" className="text-foreground/40 hover:text-primary transition-colors">關於我們</a>
          <a href="#" className="text-foreground/40 hover:text-primary transition-colors">服務條款</a>
          <a href="#" className="text-foreground/40 hover:text-primary transition-colors">隱私政策</a>
          <a href="#" className="text-foreground/40 hover:text-primary transition-colors">聯繫藝術家</a>
        </div>
      </div>
      <p className="mb-4 text-foreground/40">© 2024 ExhiBeat. 展動台北.</p>
      <div className="flex justify-center gap-4">
        <a href="#" className="hover:text-primary transition-colors">🌐</a>
        <a href="#" className="hover:text-primary transition-colors">✉️</a>
      </div>
    </footer>
  );
}
