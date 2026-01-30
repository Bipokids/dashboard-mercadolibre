// src/app/api/alertastock/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, update, child } from 'firebase/database';

// Tipos de datos
interface CuentaML {
  userId: string;
  alias: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

// 1. Lógica portada de Android: Renovar Token
async function renovarToken(refreshToken: string, clientId: string, clientSecret: string) {
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('refresh_token', refreshToken);

    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    if (!response.ok) return null;
    return await response.json(); // Retorna { access_token, refresh_token, ... }
  } catch (e) {
    console.error("Error renovando token:", e);
    return null;
  }
}

// 2. Lógica portada de Android: Validar y si falla, Renovar
async function obtenerTokenValido(cuenta: CuentaML) {
  // A. Validar token actual (/users/me)
  const checkRes = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${cuenta.accessToken}` }
  });

  if (checkRes.ok) {
    return cuenta.accessToken; // El token sigue vivo
  }

  console.log(`🔄 Token vencido para ${cuenta.alias}. Renovando...`);

  // B. Si falló, intentamos renovar
  const newData = await renovarToken(cuenta.refreshToken, cuenta.clientId, cuenta.clientSecret);
  
  if (newData && newData.access_token) {
    // C. Guardar nuevos tokens en Firebase (Igual que hace tu App Android)
    const updates: any = {};
    updates[`cuentas_mercado_libre/${cuenta.userId}/access_token`] = newData.access_token;
    updates[`cuentas_mercado_libre/${cuenta.userId}/refresh_token`] = newData.refresh_token; // ML suele rotar el refresh token también
    
    await update(ref(db), updates);
    return newData.access_token;
  }

  return null; // No se pudo recuperar la cuenta
}

// 3. API Principal
export async function POST() {
  try {
    // Paso A: Leer todas las cuentas de Firebase
    const cuentasSnapshot = await get(ref(db, 'cuentas_mercado_libre'));
    if (!cuentasSnapshot.exists()) {
      return NextResponse.json({ success: false, error: 'No hay cuentas vinculadas en Firebase' }, { status: 404 });
    }

    const cuentasData = cuentasSnapshot.val();
    const resultados: any[] = [];
    const sinStockTotal: any[] = [];
    const variantesSinStock: any[] = [];

    // Paso B: Iterar sobre cada cuenta (Usuario)
    for (const userId of Object.keys(cuentasData)) {
      const data = cuentasData[userId];
      
      const cuenta: CuentaML = {
        userId: userId,
        alias: data.alias || `User ${userId}`,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        clientId: data.client_id, // Asegúrate de que estos campos existan en tu nodo Firebase
        clientSecret: data.client_secret
      };

      // Obtener token válido (reutiliza o renueva)
      const token = await obtenerTokenValido(cuenta);

      if (!token) {
        resultados.push({ alias: cuenta.alias, status: 'error_auth', message: 'No se pudo renovar token' });
        continue;
      }

      // --- AQUÍ COMIENZA LA LÓGICA DE STOCK (Tu script original) ---
      
      // 1. Buscar Items Activos del usuario actual
      const searchRes = await fetch(`https://api.mercadolibre.com/users/${userId}/items/search?status=active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const searchData = await searchRes.json();
      const itemIds = searchData.results || [];

      if (itemIds.length === 0) {
        resultados.push({ alias: cuenta.alias, status: 'ok', items: 0 });
        continue;
      }

      // 2. Traer detalles de los items
      // Nota: Para optimizar, ML permite multiget: /items?ids=ID1,ID2... (hasta 20)
      // Aquí lo hacemos simple con Promise.all por lotes
      const itemRequests = itemIds.map((id: string) => 
        fetch(`https://api.mercadolibre.com/items/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
      );
      
      const itemsDetails = await Promise.all(itemRequests);

      // 3. Analizar Stock
      itemsDetails.forEach((item: any) => {
        const editLink = `https://www.mercadolibre.com.ar/publicaciones/${item.id}/modificar`;
        const hasVariations = item.variations && item.variations.length > 0;

        if (hasVariations) {
          item.variations.forEach((v: any) => {
            if (v.available_quantity === 0) {
              const varName = v.attribute_combinations 
                ? v.attribute_combinations.map((a: any) => `${a.name}: ${a.value_name}`).join(' - ')
                : `ID: ${v.id}`;
              
              variantesSinStock.push({
                account: cuenta.alias, // Agregamos de quién es el producto
                item_id: item.id,
                variation_id: v.id,
                variation_name: varName,
                title: item.title,
                permalink: editLink
              });
            }
          });
        } else {
          if (item.available_quantity === 0) {
            sinStockTotal.push({
              account: cuenta.alias,
              item_id: item.id,
              title: item.title,
              permalink: editLink
            });
          }
        }
      });
      
      resultados.push({ alias: cuenta.alias, status: 'procesado', items: itemsDetails.length });
    }

    // Paso C: Guardar reporte global en Firebase
    await update(ref(db, 'alertas'), {
      sin_stock_total: sinStockTotal,
      variantes_sin_stock: variantesSinStock,
      last_update: new Date().toISOString(),
      log_cuentas: resultados
    });

    return NextResponse.json({ 
      success: true, 
      data: { sinStockTotal, variantesSinStock, resultados } 
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}