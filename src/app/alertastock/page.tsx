// src/app/alertastock/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

export default function AlertaStockPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>({ sin_stock_total: [], variantes_sin_stock: [] });
  const [lastUpdate, setLastUpdate] = useState('');

  // 1. Escuchar cambios en Firebase en Tiempo Real
  useEffect(() => {
    const alertasRef = ref(db, 'alertas');
    const unsubscribe = onValue(alertasRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        setData({
          sin_stock_total: val.sin_stock_total || [],
          variantes_sin_stock: val.variantes_sin_stock || []
        });
        if(val.last_update) setLastUpdate(new Date(val.last_update).toLocaleString());
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Función para forzar la verificación (Llama a nuestra API Route)
  const verificarAhora = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/alertastock', { method: 'POST' });
      const json = await res.json();
      if (!json.success) alert('Error: ' + json.error);
    } catch (e) {
      alert('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🚨 Control de Stock ML</h1>
          <p className="text-sm text-gray-500">Última actualización: {lastUpdate || '...'}</p>
        </header>

        <div className="flex justify-center mb-8">
          <button
            onClick={verificarAhora}
            disabled={loading}
            className={`px-6 py-3 rounded-lg font-semibold text-white shadow-md transition-all
              ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-95'}
            `}
          >
            {loading ? '🔄 Verificando ML...' : '⚡ Verificar Stock Ahora'}
          </button>
        </div>

        {/* Sección Publicaciones Completas */}
        <section className="mb-8 bg-white rounded-xl shadow p-6 border border-gray-100">
          <h2 className="text-xl font-semibold text-red-600 mb-4 flex items-center gap-2">
            📦 Publicaciones Completas Pausadas ({data.sin_stock_total.length})
          </h2>
          {data.sin_stock_total.length === 0 ? (
            <p className="text-green-600 font-medium bg-green-50 p-3 rounded">✅ Todo activo</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase">
                  <tr>
                    <th className="p-3">Título</th>
                    <th className="p-3">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.sin_stock_total.map((item: any) => (
                    <tr key={item.item_id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium">{item.title} <span className="text-xs text-gray-400 block">{item.item_id}</span></td>
                      <td className="p-3">
                        <a href={item.permalink} target="_blank" className="text-blue-600 hover:underline">Editar en ML</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Sección Variantes */}
        <section className="mb-8 bg-white rounded-xl shadow p-6 border border-gray-100">
          <h2 className="text-xl font-semibold text-orange-600 mb-4 flex items-center gap-2">
            🎨 Variantes Sin Stock ({data.variantes_sin_stock.length})
          </h2>
          {data.variantes_sin_stock.length === 0 ? (
            <p className="text-green-600 font-medium bg-green-50 p-3 rounded">✅ Variantes con stock</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase">
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3">Variante</th>
                    <th className="p-3">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.variantes_sin_stock.map((item: any) => (
                    <tr key={`${item.item_id}-${item.variation_id}`} className="hover:bg-gray-50">
                      <td className="p-3 font-medium">{item.title}</td>
                      <td className="p-3 text-gray-600">{item.variation_name}</td>
                      <td className="p-3">
                        <a href={item.permalink} target="_blank" className="text-blue-600 hover:underline">Editar</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}