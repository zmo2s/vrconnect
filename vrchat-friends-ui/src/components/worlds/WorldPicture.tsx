import { useState } from "react";
import { Globe2, ImageOff, Loader2 } from "lucide-react";
interface WorldPictureProps { src?: string; name: string; loading?: boolean; }
export default function WorldPicture({ src, name, loading = false }: WorldPictureProps) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  if (src && failedSrc !== src) return <img className="world-picture" src={src} alt={`${name} world preview`} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />;
  return <div className="world-picture world-picture-fallback" role="img" aria-label={loading ? "Loading world picture" : "World picture unavailable"}>
    {loading ? <Loader2 className="animate-spin" size={25} /> : src ? <ImageOff size={28} /> : <Globe2 size={28} />}
    <span>{loading ? "Loading world picture…" : "World picture unavailable"}</span>
  </div>;
}
