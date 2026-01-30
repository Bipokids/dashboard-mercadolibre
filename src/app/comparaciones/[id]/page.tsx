'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation'; // useParams es clave aquí
import { Trophy, TrendingUp, TrendingDown, ExternalLink, ArrowLeft, Swords } from 'lucide-react';

export default function VersusPage() {
  const params = useParams(); // Obtenemos el ID de la URL
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (params.id) {
      fetch('/api/comparaciones/versus', {
        method: 'POST',
        body: JSON.stringify({ itemId: params.id }),
        headers: { 'Content-Type': 'application/json' }
      })
      .then(res => res.json())
      .then(resp => {
        if (resp.success) setData(resp.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50 gap-4">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
        <p className="text-gray-500 font-medium animate-pulse">Buscando al campeón de la categoría...</p>
      </div>
    );
  }

  if (!data) return <div className="p-10 text-center">No se pudo cargar la comparación.</div>;

  // Lógica de Ganador/Perdedor
  const priceDiff = data.me.price - data.rival.price;
  const isCheaper = priceDiff < 0;
  const salesDiff = data.rival.sold_quantity - data.me.sold_quantity;
  const potentialLostRevenue = salesDiff > 0 ? salesDiff * data.me.price : 0;

  return (
    <div className="min-h-screen bg-gray-100 p-6 md:p-12">
      {/* Botón Volver */}
      <button 
        onClick={() => router.back()} 
        className="mb-6 flex items-center text-gray-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="w-5 h-5 mr-2" />
        Volver a mis productos
      </button>

      {/* Título del Ring */}
      <div className="text-center mb-12">
        <span className="bg-blue-100 text-blue-800 text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          {data.category}
        </span>
        <h1 className="text-4xl font-extrabold text-gray-900 mt-4 flex justify-center items-center gap-3">
          Análisis Competitivo <Swords className="w-8 h-8 text-red-500" />
        </h1>
        <p className="text-gray-600 mt-2">Comparación directa contra el líder del mercado</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        
        {/* TARJETA: TU PRODUCTO (Azul) */}
        <div className="bg-white rounded-2xl shadow-xl border-t-8 border-blue-500 overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">
          <div className="bg-blue-50 p-4 text-center border-b border-blue-100">
            <h2 className="text-blue-900 font-bold text-lg">TU PRODUCTO</h2>
          </div>
          <div className="p-6 flex flex-col items-center">
            <img src={data.me.thumbnail} className="w-48 h-48 object-contain mb-6 mix-blend-multiply" alt="Yo" />
            <h3 className="text-gray-900 font-semibold text-center line-clamp-2 h-14">{data.me.title}</h3>
            
            <div className="w-full mt-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-gray-500">Precio</span>
                <span className={`font-bold text-xl ${isCheaper ? 'text-green-600' : 'text-red-500'}`}>
                  $ {data.me.price.toLocaleString('es-AR')}
                </span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-gray-500">Ventas Acum.</span>
                <span className="font-bold text-gray-800">{data.me.sold_quantity}</span>
              </div>
            </div>
            
            <a href={data.me.permalink} target="_blank" className="mt-8 w-full block text-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg transition-colors">
              Ver Publicación
            </a>
          </div>
        </div>

        {/* TARJETA: VERSUS (Estadísticas Centrales) */}
        <div className="flex flex-col justify-center space-y-6">
          {/* Diferencia de Precio */}
          <div className={`p-6 rounded-xl shadow-md border-l-4 ${isCheaper ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
            <h4 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-1">Diferencia de Precio</h4>
            <div className="flex items-center gap-3">
              {isCheaper ? <TrendingDown className="w-8 h-8 text-green-600"/> : <TrendingUp className="w-8 h-8 text-red-600"/>}
              <div>
                <span className={`text-2xl font-bold ${isCheaper ? 'text-green-700' : 'text-red-700'}`}>
                  {isCheaper ? '-' : '+'}$ {Math.abs(priceDiff).toLocaleString('es-AR')}
                </span>
                <p className="text-sm text-gray-600 leading-tight mt-1">
                  {isCheaper ? '¡Excelente! Tienes un precio más competitivo.' : 'Tu rival es más barato. Considera revisar tus costos.'}
                </p>
              </div>
            </div>
          </div>

          {/* Oportunidad Perdida */}
          <div className="bg-yellow-50 p-6 rounded-xl shadow-md border-l-4 border-yellow-500">
             <h4 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-1">Brecha de Mercado</h4>
             <div className="mt-2">
                <span className="text-3xl font-bold text-yellow-800">{salesDiff > 0 ? salesDiff : 0}</span>
                <span className="text-yellow-700 ml-2 text-sm">unidades de diferencia</span>
             </div>
             {potentialLostRevenue > 0 && (
                 <p className="text-sm text-yellow-800 mt-2 font-medium">
                    Estás dejando de facturar aprox. <br/>
                    <span className="text-lg text-yellow-900 font-bold">$ {potentialLostRevenue.toLocaleString('es-AR')}</span>
                 </p>
             )}
          </div>
        </div>

        {/* TARJETA: EL CAMPEÓN (Dorado) */}
        <div className="bg-white rounded-2xl shadow-xl border-t-8 border-yellow-400 overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 relative">
          <div className="absolute top-0 right-0 p-2">
             <Trophy className="w-8 h-8 text-yellow-400 drop-shadow-sm" />
          </div>
          <div className="bg-yellow-50 p-4 text-center border-b border-yellow-100">
            <h2 className="text-yellow-800 font-bold text-lg">LÍDER DEL NICHO</h2>
          </div>
          <div className="p-6 flex flex-col items-center">
            <img src={data.rival.thumbnail} className="w-48 h-48 object-contain mb-6 mix-blend-multiply" alt="Rival" />
            <h3 className="text-gray-900 font-semibold text-center line-clamp-2 h-14">{data.rival.title}</h3>
            
            <div className="w-full mt-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-gray-500">Precio</span>
                <span className="font-bold text-xl text-gray-900">
                  $ {data.rival.price.toLocaleString('es-AR')}
                </span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-gray-500">Ventas Acum.</span>
                <span className="font-bold text-yellow-600">{data.rival.sold_quantity}</span>
              </div>
            </div>
            
            <a href={data.rival.permalink} target="_blank" className="mt-8 w-full flex justify-center items-center gap-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-semibold py-2 rounded-lg transition-colors">
              Espiar Publicación <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}