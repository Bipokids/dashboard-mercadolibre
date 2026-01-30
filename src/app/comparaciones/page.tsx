'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Package, ChevronRight, BarChart2 } from 'lucide-react';

export default function ComparacionesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<Record<string, any[]>>({});

  useEffect(() => {
    fetch('/api/comparaciones/mis-productos')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
            setInventory(data.grouped);
        }
        setLoading(false);
      })
      .catch(err => {
          console.error(err);
          setLoading(false);
      });
  }, []);

  const handleSelectProduct = (itemId: string) => {
    // Navegamos a la página de detalle donde haremos el VS.
    router.push(`/comparaciones/${itemId}`);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen bg-gray-50">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-8 h-8 text-blue-600" />
            Comparador Competitivo
        </h1>
        <p className="text-gray-600 mt-2">Selecciona uno de tus productos para enfrentarlo con el líder del mercado.</p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : Object.keys(inventory).length === 0 ? (
        <div className="text-center p-10 bg-white rounded-xl shadow">
            <p>No se encontraron productos activos.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(inventory).map(([category, items]) => (
            <div key={category} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Cabecera de Categoría */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Package className="w-5 h-5 text-gray-500" />
                    {category}
                </h2>
                <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-full border">
                    {items.length} productos
                </span>
              </div>

              {/* Grid de Productos */}
              <div className="divide-y divide-gray-100">
                {items.map((item: any) => (
                  <div 
                    key={item.id}
                    onClick={() => handleSelectProduct(item.id)}
                    className="group flex items-center p-4 hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    {/* Imagen */}
                    <div className="w-16 h-16 bg-white rounded-lg border border-gray-200 p-1 flex-shrink-0">
                        <img 
                            src={item.thumbnail} 
                            alt={item.title} 
                            className="w-full h-full object-contain"
                        />
                    </div>

                    {/* Info */}
                    <div className="ml-4 flex-1">
                        <h3 className="text-gray-900 font-medium group-hover:text-blue-700 transition-colors line-clamp-1">
                            {item.title}
                        </h3>
                        <p className="text-gray-500 text-sm mt-1">
                            ${item.price?.toLocaleString('es-AR')}
                        </p>
                    </div>

                    {/* Acción */}
                    <div className="ml-4">
                        <button className="p-2 rounded-full bg-white border border-gray-200 text-gray-400 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}