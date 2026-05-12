export default function ScanLivePreview({ thumbnails }) {
  if (!thumbnails || thumbnails.length === 0) {
    return (
      <div style={{ backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        No flagged frames yet
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#dc2626' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>Flagged Frames ({thumbnails.length})</span>
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 2px', WebkitOverflowScrolling: 'touch' }}>
        {thumbnails.map((thumb, index) => (
          <div key={index} style={{ position: 'relative', flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '2px solid #dc2626', boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }}>
            <img src={thumb} alt={`Flagged frame ${index + 1}`} style={{ width: 160, height: 90, objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(220,38,38,0.85)', color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textAlign: 'center', padding: '3px 0' }}>
              FLAGGED
            </div>
            <div style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4 }}>
              #{index + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
