import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { obtenerTokenValido, CuentaML } from '@/lib/mercadolibre';

async function fetchAuth(url: string, token: string) {
    try {
        const res = await fetch(url, { 
            headers: { Authorization: `Bearer ${token}` } 
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}

export async function GET() {
  try {
    // 1. AUTH
    const cuentasSnap = await get(ref(db, 'cuentas_mercado_libre'));
    if (!cuentasSnap.exists()) return NextResponse.json({ success: false, error: 'No hay cuentas' }, { status: 404 });
    const cuentasData = cuentasSnap.val();
    const targetId = "322199723"; // Tu ID
    let data = cuentasData[targetId] || Object.values(cuentasData)[0];
    
    // @ts-ignore
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

    // 2. OBTENER MIS ITEMS ACTIVOS
    const searchUrl = `https://api.mercadolibre.com/users/${cuenta.userId}/items/search?status=active&limit=50`;
    const searchData = await fetchAuth(searchUrl, token);
    
    if (!searchData || !searchData.results) {
        return NextResponse.json({ success: true, grouped: {} });
    }

    const itemIds = searchData.results;

    // 3. OBTENER DETALLES DE LOS ITEMS
    // ML permite hasta 20 items por request en multiget. Hacemos chunks.
    let allItems: any[] = [];
    for (let i = 0; i < itemIds.length; i += 20) {
        const chunk = itemIds.slice(i, i + 20);
        const detailsUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=id,title,price,thumbnail,category_id,permalink`;
        const detailsData = await fetchAuth(detailsUrl, token);
        if (detailsData) {
            allItems = [...allItems, ...detailsData.map((d: any) => d.body)];
        }
    }

    // 4. OBTENER NOMBRES DE CATEGORÍAS ÚNICAS
    const categoryIds = [...new Set(allItems.map(i => i.category_id))];
    const categoryNames: Record<string, string> = {};

    await Promise.all(categoryIds.map(async (catId) => {
        const catData = await fetchAuth(`https://api.mercadolibre.com/categories/${catId}`, token);
        if (catData) categoryNames[catId as string] = catData.name;
    }));

    // 5. AGRUPAR POR NOMBRE DE CATEGORÍA
    const grouped: Record<string, any[]> = {};

    allItems.forEach(item => {
        const catName = categoryNames[item.category_id] || "Otras Categorías";
        if (!grouped[catName]) grouped[catName] = [];
        
        grouped[catName].push({
            id: item.id,
            title: item.title,
            price: item.price,
            thumbnail: item.thumbnail,
            category_id: item.category_id,
            permalink: item.permalink
        });
    });

    return NextResponse.json({ success: true, grouped });

  } catch (error: any) {
    console.error("🔥 Error Mis Productos:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}