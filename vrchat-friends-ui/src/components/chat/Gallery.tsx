import { X } from "lucide-react";

interface GalleryProps {
  images: string[];
  friendName: string;
  onClose: () => void;
}

const Gallery = ({ images, friendName, onClose }: GalleryProps) => {
  if (images.length === 0) {
    return (
      <div className="flex h-full flex-col border-l border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Shared Photos</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">No photos with {friendName} yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Shared Photos</h3>
          <p className="text-xs text-muted-foreground">{images.length} photo{images.length !== 1 ? "s" : ""} with {friendName}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {images.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-lg">
              <img
                src={src}
                alt={`Shared photo ${i + 1}`}
                className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
              />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Gallery;
