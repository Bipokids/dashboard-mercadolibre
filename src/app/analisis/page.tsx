'use client';
import { useState, useEffect } from 'react';

const MESES = [
  { id: 1, nombre: 'Enero' }, { id: 2, nombre: 'Febrero' }, { id: 3, nombre: 'Marzo' },
  { id: 4, nombre: 'Abril' }, { id: 5, nombre: 'Mayo' }, { id: 6, nombre: 'Junio' },
  { id: 7, nombre: 'Julio' }, { id: 8, nombre: 'Agosto' }, { id: 9, nombre: 'Septiembre' },
  { id: 10, nombre: 'Octubre' }, { id: 11, nombre: 'Noviembre' }, { id: 12, nombre: 'Diciembre' }
];

export default function AnalisisPage() {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [reporte, setReporte] = useState<any>(null);

  useEffect(() => {
    fetch('/api/analisis/categorias')
      .then(res => res.json())
      .then(data => {
        if (data.success) setCategorias(data.data);
      });
  }, []);

  const handleAnalizar = async () => {
    if (!selectedCat) return;
    setLoading(true);
    setReporte(null);

    try {
      const res = await fetch('/api/analisis/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: selectedCat, month: selectedMonth })
      });
      const json = await res.json();
      if (json.success) {
        setReporte(json.data);
      } else {
        alert('Error: ' + json.error);
      }
    } catch (e) {
      alert('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const nombreMes = MESES.find(m => m.id == selectedMonth)?.nombre || 'Mes';

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto"> {/* Ancho aumentado para 4 columnas */}
        
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">📊 Análisis de Mercado</h1>
          <p className="text-gray-500">Inteligencia de negocio y competencia.</p>
        </header>

        {/* CONTROLES */}
        <div className="bg-white p-6 rounded-xl shadow mb-8 flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-1/2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
            <select 
              className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
            >
              <option value="">-- Elige una categoría --</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-1/4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Mes a analizar</label>
            <select 
              className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {MESES.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={handleAnalizar}
            disabled={!selectedCat || loading}
            className={`px-6 py-3 rounded-lg font-bold text-white transition-all w-full md:w-auto h-[50px]
              ${!selectedCat || loading ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md'}
            `}
          >
            {loading ? 'Analizando...' : 'Comenzar Análisis'}
          </button>
        </div>

        {/* RESULTADOS */}
        {reporte && (
          <div className="space-y-8 animate-fade-in">
            
            {/* TARJETAS DE MÉTRICAS (GRID DE 4) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Tarjeta 1: Ventas Actuales */}
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Tus Ventas {nombreMes} {reporte.stats.year_current}
                </p>
                <p className="text-3xl font-bold text-gray-800 mt-2">{reporte.stats.ventas_actuales}</p>
                <p className="text-xs text-blue-600 mt-1 font-medium">Facturación propia</p>
              </div>

              {/* Tarjeta 2: Ventas Año Pasado */}
              <div className="bg-white p-6 rounded-xl shadow border-l-4 border-purple-500">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Tus Ventas {nombreMes} {reporte.stats.year_prev}
                </p>
                <p className="text-3xl font-bold text-gray-800 mt-2">{reporte.stats.ventas_anterior}</p>
                <p className="text-xs text-purple-600 mt-1 font-medium">Comparativa histórica</p>
              </div>

              {/* Tarjeta 3: Rendimiento */}
              <div className={`bg-white p-6 rounded-xl shadow border-l-4 ${Number(reporte.stats.porcentaje_crecimiento) >= 0 ? 'border-green-500' : 'border-red-500'}`}>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Crecimiento Interanual</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-3xl font-bold ${Number(reporte.stats.porcentaje_crecimiento) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Number(reporte.stats.porcentaje_crecimiento) > 0 ? '+' : ''}{reporte.stats.porcentaje_crecimiento}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Vs. mismo mes año anterior</p>
              </div>

              {/* Tarjeta 4: MERCADO GLOBAL (Nueva) */}
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-xl shadow border border-yellow-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 text-yellow-600">
                        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                    </svg>
                </div>
                <p className="text-xs text-yellow-700 uppercase font-bold tracking-wider relative z-10">
                   Volumen Mercado (Top 10)
                </p>
                <p className="text-3xl font-bold text-yellow-800 mt-2 relative z-10">
                    {reporte.stats.mercado_volumen.toLocaleString('es-AR')}
                </p>
                <p className="text-xs text-yellow-600 mt-1 font-medium relative z-10">
                    Unidades vendidas (Líderes)
                </p>
              </div>

            </div>

            {/* TABLA TOP 10 */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  🏆 Top 10 Más Vendidos
                  <span className="text-sm font-normal text-gray-500 ml-2 hidden sm:inline">(Categoría: {categorias.find(c => c.id === selectedCat)?.name})</span>
                </h2>
                <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-3 py-1 rounded-full">Líderes del Nicho</span>
              </div>
              
              <div className="overflow-x-auto">
                {reporte.top10.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <p>⚠️ No se encontraron datos del Top 10.</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-100 uppercase text-xs font-semibold text-gray-500">
                      <tr>
                        <th className="p-4 w-10 text-center">#</th>
                        <th className="p-4">Producto</th>
                        <th className="p-4">Precio</th>
                        <th className="p-4 text-center">Ventas Totales</th>
                        <th className="p-4 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reporte.top10.map((item: any, index: number) => (
                        <tr key={item.id} className="hover:bg-blue-50 transition-colors group">
                          <td className="p-4 font-bold text-center text-gray-400 group-hover:text-blue-600 text-lg">
                            {index + 1}
                            {index < 3 && <span className="ml-1 text-base">👑</span>}
                          </td>
                          <td className="p-4 flex items-center gap-3">
                            <img src={item.thumbnail} alt="" className="w-14 h-14 object-contain rounded bg-white border border-gray-200 p-1" />
                            <span className="font-medium text-gray-800 line-clamp-2 max-w-md text-base">{item.title}</span>
                          </td>
                          <td className="p-4 font-semibold text-gray-700 text-base">
                            $ {item.price?.toLocaleString('es-AR')}
                          </td>
                          <td className="p-4 text-center">
                             <div className="inline-block bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-md font-bold">
                                {item.sold_quantity?.toLocaleString('es-AR')}
                             </div>
                          </td>
                          <td className="p-4 text-center">
                            <a 
                              href={item.permalink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-bold hover:underline text-xs border border-blue-200 px-3 py-1 rounded bg-white"
                            >
                              Ver
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}