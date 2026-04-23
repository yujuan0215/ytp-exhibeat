interface ActionToastProps {
  open: boolean;
  message: string;
}

export function ActionToast({ open, message }: ActionToastProps) {
  if (!open) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2">
      <div className="rounded-full border border-[#df8eff]/35 bg-[#111827]/95 px-4 py-2 text-sm font-semibold text-[#f3e8ff] shadow-2xl backdrop-blur-sm">
        {message}
      </div>
    </div>
  );
}
