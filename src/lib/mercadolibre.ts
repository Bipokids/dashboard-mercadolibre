// src/lib/mercadolibre.ts
import { db } from '@/lib/firebase';
import { ref, update } from 'firebase/database';

// Tipos básicos
export interface CuentaML {
  userId: string;
  alias: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

// Renovar Token (Privada)
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
    return await response.json();
  } catch (e) {
    console.error("Error renovando token:", e);
    return null;
  }
}

// Obtener Token Válido (Pública)
export async function obtenerTokenValido(cuenta: CuentaML) {
  // 1. Validar token actual
  const checkRes = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${cuenta.accessToken}` }
  });

  if (checkRes.ok) return cuenta.accessToken;

  console.log(`🔄 Token vencido para ${cuenta.alias}. Renovando...`);

  // 2. Si falló, renovar
  const newData = await renovarToken(cuenta.refreshToken, cuenta.clientId, cuenta.clientSecret);
  
  if (newData && newData.access_token) {
    // 3. Guardar en Firebase
    const updates: any = {};
    updates[`cuentas_mercado_libre/${cuenta.userId}/access_token`] = newData.access_token;
    updates[`cuentas_mercado_libre/${cuenta.userId}/refresh_token`] = newData.refresh_token; 
    
    await update(ref(db), updates);
    return newData.access_token;
  }

  return null;
}