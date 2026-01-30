import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { obtenerTokenValido, CuentaML } from '@/lib/mercadolibre';

// --- HELPER: Fetch Seguro (Evita que explote si recibe HTML/Error) ---
async function fetchSeguro(url: string, options: any = {}) {
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            return { error: 'Invalid JSON', raw: text }; 
        }
    } catch (e) {
        console.error(`🔥 Error red: ${url}`);
        return null;
    }
}

export async function GET() {
  try {
    // 1. Configuración y Auth
    const cuentasSnap = await get(ref(db, 'cuentas_mercado_libre'));
    if (!cuentasSnap.exists()) return NextResponse.json({ success: false, error: 'No hay cuentas' }, { status: 404 });

    const cuentasData = cuentasSnap.val();
    const targetId = "322199723"; 
    let data = cuentasData[targetId];

    if (!data) {
        const foundKey = Object.keys(cuentasData).find(key => cuentasData[key].user_id == targetId);
        data = foundKey ? cuentasData[foundKey] : Object.values(cuentasData)[0];
    }

    const cuenta: CuentaML = {
        userId: data.user_id || targetId,
        alias: data.alias || 'Usuario',
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        clientId: data.client_id,
        clientSecret: data.client_secret
    };

    const token = await obtenerTokenValido(cuenta);
    if (!token) return NextResponse.json({ success: false, error: 'Auth falló' }, { status: 401 });

    const meData = await fetchSeguro('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
    const realUserId = meData?.id || cuenta.userId;
    console.log(`👤 Usuario: ${meData?.nickname || 'Desconocido'} (${realUserId})`);

    let itemIds: string[] = [];
    const categoriasSet = new Map();

    // --- BÚSQUEDA ---
    
    // Nivel 1: Interna (Token)
    const dataInternal = await fetchSeguro(`https://api.mercadolibre.com/users/${realUserId}/items/search?access_token=${token}`);
    if (dataInternal?.results?.length > 0) itemIds = dataInternal.results;

    // Nivel 2: Pública
    if (itemIds.length === 0) {
        const dataPublic = await fetchSeguro(`https://api.mercadolibre.com/sites/MLA/search?seller_id=${realUserId}`);
        if (dataPublic?.results?.length > 0) {
             dataPublic.results.forEach((item: any) => {
                if(item.category_id) categoriasSet.set(item.category_id, item.category_id);
            });
            itemIds = ['loaded_via_public'];
        }
    }

    // Nivel 3: Historial de Ventas
    if (itemIds.length === 0) {
        console.log("👉 Buscando en Historial de Ventas...");
        const dataOrders = await fetchSeguro(`https://api.mercadolibre.com/orders/search?seller=${realUserId}&order.status=paid&access_token=${token}`);
        
        if (dataOrders?.results?.length > 0) {
            const itemsFromOrders: string[] = [];
            dataOrders.results.forEach((order: any) => {
                order.order_items?.forEach((oi: any) => {
                    // Intentamos rescatar categoría directo de la orden
                    if (oi.item && oi.item.category_id) {
                         categoriasSet.set(oi.item.category_id, oi.item.category_id);
                    }
                    if(oi.item && oi.item.id) itemsFromOrders.push(oi.item.id);
                });
            });
            itemIds = [...new Set(itemsFromOrders)];
            console.log(`✅ IDs extraídos de ventas: ${itemIds.length}`);
        }
    }

    // --- EXTRACTOR "UNO A UNO CON TOKEN" (EL FIX) ---
    if (categoriasSet.size > 0) {
         console.log("✨ Categorías detectadas directamente.");
    } 
    else if (itemIds.length > 0 && itemIds[0] !== 'loaded_via_public') {
        // Tomamos hasta 15 items para no hacer esperar mucho al usuario
        const idsToCheck = itemIds.slice(0, 15); 
        console.log("🔄 Consultando items UNO A UNO (Autenticado)...");

        // Hacemos las peticiones en paralelo pero INDIVIDUALES y CON TOKEN
        // Esto evita el bloqueo masivo (403) y permite ver items privados/pausados
        const promesas = idsToCheck.map(id => 
            fetchSeguro(`https://api.mercadolibre.com/items/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
        );
        
        const resultados = await Promise.all(promesas);

        resultados.forEach((item: any) => {
            // Verificamos si vino bien
            if (item && item.category_id) {
                categoriasSet.set(item.category_id, item.category_id);
            } else if (item && item.id) {
                console.warn(`⚠️ Item ${item.id} recuperado pero sin categoría.`);
            }
        });
    }

    const catIds = Array.from(categoriasSet.values());
    console.log(`📂 Categorías finales: ${catIds.length}`);

    if (catIds.length === 0) return NextResponse.json({ success: true, data: [] });

    // Resolución de Nombres
    const catDetailsProm = catIds.map(async (id) => {
        if (!id) return null;
        const data = await fetchSeguro(`https://api.mercadolibre.com/categories/${id}`);
        if (!data || data.error) return { id, name: `ID: ${id}` };
        return data;
    });

    const catDetailsRaw = await Promise.all(catDetailsProm);
    
    const resultado = catDetailsRaw
        .filter(c => c && c.id)
        .map((c: any) => ({
            id: c.id,
            name: c.name
        }));

    return NextResponse.json({ success: true, data: resultado });

  } catch (error: any) {
    console.error("Error Global:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}