import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { Map, useControl, type MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import urlWorkerMaplibre from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  centreEmprise, couleurClasse, ECHELLE_HAUTEUR, hexVersRgba,
  type CollectionCommunes, type EntiteCommune, type ProprietesCommune,
} from "../lib/risque";
import { classeEau, COULEURS_EAU } from "../lib/fiabilite";

/** « score » : couleur et hauteur selon le score de risque ; « eau » : selon le % d'eau détectée par Sentinel-1. */
export type Couche = "score" | "eau";
const VITESSE_ROTATION = 6; // degrés par seconde : un tour par minute

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
  couche: Couche;
  rotation: boolean;
}

export default function Carte({ communes, selection, onSelection, mode3d, couche: coucheAffichee, rotation }: Props) {
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
  }, [selection, mode3d, communes, chargee, rotation]);

  // Rotation automatique (3D) : la caméra tourne autour du point visé ; l'arrêt relance le recentrage ci-dessus
  useEffect(() => {
    const map = carte.current?.getMap();
    if (!rotation || !mode3d || !chargee || !map) return;
    let image = 0;
    const depart = setTimeout(() => {   // après l'animation de recentrage (900 ms)
      const t0 = performance.now();
      const cap0 = map.getBearing();
      const tourner = (t: number) => {
        map.setBearing((cap0 + ((t - t0) / 1000) * VITESSE_ROTATION) % 360);
        image = requestAnimationFrame(tourner);
      };
      image = requestAnimationFrame(tourner);
    }, 950);
    return () => { clearTimeout(depart); cancelAnimationFrame(image); };
  }, [rotation, mode3d, chargee, selection]);

  const eauMax = useMemo(
    () => Math.max(...communes.features.map((f) => f.properties.pct_eau_stagnante_moyen)),
    [communes],
  );

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
        // Hauteur sur une échelle 0-100 dans les deux couches (eau : 100 = commune où le radar en a vu le plus)
        getElevation: (f) =>
          Math.max(coucheAffichee === "eau" ? (100 * f.properties.pct_eau_stagnante_moyen) / eauMax : f.properties.score_risque, 1) *
          ECHELLE_HAUTEUR,
        // Les autres communes sont atténuées quand une commune est sélectionnée
        getFillColor: (f) => {
          const alpha = !selection ? 215 : f.properties.commune === selection ? 255 : 110;
          return coucheAffichee === "eau"
            ? hexVersRgba(COULEURS_EAU[classeEau(f.properties.pct_eau_stagnante_moyen)], alpha)
            : couleurClasse(f.properties.classe_risque, alpha);
        },
        stroked: true,
        getLineColor: (f) => (f.properties.commune === selection ? [20, 20, 20, 255] : [90, 90, 90, 120]),
        getLineWidth: (f) => (f.properties.commune === selection ? 3 : 1),
        lineWidthUnits: "pixels",
        updateTriggers: {
          getFillColor: [selection, coucheAffichee], getElevation: coucheAffichee,
          getLineColor: selection, getLineWidth: selection,
        },
      }),
    [communes, selection, mode3d, coucheAffichee, eauMax],
  );

  const infobulle = ({ object }: PickingInfo<EntiteCommune>) =>
    object
      ? {
          html: `<b>${object.properties.commune}</b><br/>Risque : ${object.properties.classe_risque}<br/>` +
                `Score : ${Math.round(object.properties.score_risque)}/100 · rang ${object.properties.rang}/53<br/>` +
                `Eau détectée (satellite) : ${object.properties.pct_eau_stagnante_moyen.toFixed(2).replace(".", ",")} %`,
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
