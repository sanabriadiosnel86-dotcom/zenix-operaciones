import { Hourglass } from 'lucide-react';
import { Encabezado, Tarjeta, Vacio } from '../ui';

export default function Proximamente({ modulo, fase, detalle }: { modulo: string; fase: number; detalle: string }) {
  return (
    <>
      <Encabezado titulo={modulo} detalle={`Todavía no disponible · previsto para la fase ${fase}`} />
      <Tarjeta>
        <Vacio icono={Hourglass} titulo="Este módulo todavía no está construido">
          {detalle} No hay nada que cargar acá por ahora: se habilita cuando ustedes indiquen empezar la fase {fase}.
        </Vacio>
      </Tarjeta>
    </>
  );
}
