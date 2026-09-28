import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { Map, useControl, type MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import urlWorkerMaplibre from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  centreEmprise, couleurClasse, ECHELLE_HAUTEUR,
  type CollectionCommunes, type EntiteCommune, type ProprietesCommune,
} from "../lib/risque";

// MapLibre 6 charge son « worker » (programme qui prépare le fond de carte) comme un module séparé :
// on le fait empaqueter par Vite et on donne son adresse, sinon le fond de carte reste vide.
setWorkerUrl(urlWorkerMaplibre);

// Fond de carte Carto « Positron » : gratuit, sans clé API
const FOND_DE_CARTE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const VUE_DAKAR = { longitude: -17.33, latitude: 14.74, zoom: 9.7 };

/** deck.gl branché comme couche de la carte MapLibre : la carte gère la navigation, deck.gl dessine
 *  les communes et reçoit clics et survols (intégration recommandée avec react-map-gl 8). */
function CoucheDeck(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

interface Props {
  communes: CollectionCommunes;
  selection: string | null;
  onSelection: (commune: string | null) => void;
  mode3d: boolean;
}

export default function Carte({ communes, selection, onSelection, mode3d }: Props) {
  const carte = useRef<MapRef>(null);
  const [survol, setSurvol] = useState(false);
  const [chargee, setChargee] = useState(false);

  // Recentrage animé sur la commune sélectionnée, ou retour à la vue d'ensemble
  useEffect(() => {
    if (!chargee) return;
    const cible = communes.features.find((f) => f.properties.commune === selection);
    const [longitude, latitude] = cible ? centreEmprise(cible.geometry) : [VUE_DAKAR.longitude, VUE_DAKAR.latitude];
    carte.current?.flyTo({
      center: [longitude, latitude],
      zoom: cible ? 11.8 : VUE_DAKAR.zoom,
      pitch: mode3d ? 45 : 0,
      bearing: mode3d ? -10 : 0,
      duration: 900,
    });
  }, [selection, mode3d, communes, chargee]);

  const couche = useMemo(
    () =>
      new GeoJsonLayer<ProprietesCommune>({
        id: "communes",
        data: communes,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 80],
        extruded: mode3d,
        wireframe: mode3d,
        getElevation: (f) => Math.max(f.properties.score_risque, 1) * ECHELLE_HAUTEUR,
        // Les autres communes sont atténuées quand une commune est sélectionnée
        getFillColor: (f) =>
          couleurClasse(f.properties.classe_risque, !selection ? 215 : f.properties.commune === selection ? 255 : 110),
        stroked: true,
        getLineColor: (f) => (f.properties.commune === selection ? [20, 20, 20, 255] : [90, 90, 90, 120]),
        getLineWidth: (f) => (f.properties.commune === selection ? 3 : 1),
        lineWidthUnits: "pixels",
        updateTriggers: { getFillColor: selection, getLineColor: selection, getLineWidth: selection },
      }),
    [communes, selection, mode3d],
  );

  const infobulle = ({ object }: PickingInfo<EntiteCommune>) =>
    object
      ? {
          html: `<b>${object.properties.commune}</b><br/>Risque : ${object.properties.classe_risque}<br/>` +
                `Score : ${Math.round(object.properties.score_risque)}/100 · rang ${object.properties.rang}/53`,
          style: { background: "#1f2937", color: "white", fontSize: "13px", padding: "6px 8px", borderRadius: "6px" },
        }
      : null;

  return (
    <Map
      ref={carte}
      initialViewState={VUE_DAKAR}
      mapStyle={FOND_DE_CARTE}
      maxPitch={60}
      dragRotate={mode3d}
      touchPitch={mode3d}
      cursor={survol ? "pointer" : "grab"}
      onLoad={() => setChargee(true)}
    >
      <CoucheDeck
        layers={[couche]}
        getTooltip={infobulle as MapboxOverlayProps["getTooltip"]}
        onHover={(info) => setSurvol(Boolean(info.object))}
        // Clic sur une commune : sélection ; clic dans le vide : désélection
        onClick={(info: PickingInfo<EntiteCommune>) => onSelection(info.object?.properties.commune ?? null)}
      />
    </Map>
  );
}
