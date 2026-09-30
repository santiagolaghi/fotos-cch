import { NextResponse } from 'next/server';
export async function GET(){return NextResponse.json({status:'not_connected',message:'Canva OAuth se habilita al registrar la integración. La selección de fotos puede enviarse como assets desde URLs temporales servidas por el backend.'})}
