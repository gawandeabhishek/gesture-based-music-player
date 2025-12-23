"use client";

import { useEffect, useRef, useState } from "react";
import * as handpose from "@tensorflow-models/handpose";
import "@tensorflow/tfjs-backend-webgl";

export default function TempHandTest() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastActionRef = useRef<number>(0);

  const [status, setStatus] = useState("Initializing...");
  const [direction, setDirection] = useState<"EAST" | "WEST" | "CENTER">(
    "CENTER"
  );
  const [volume, setVolume] = useState(50);

  useEffect(() => {
    let model: handpose.HandPose;

    async function setup() {
      console.log("Initializing TFJS...");
      setStatus("Loading model...");

      // Create hidden video
      const video = document.createElement("video");
      video.setAttribute("playsinline", "true");
      video.style.display = "none";
      document.body.appendChild(video);
      videoRef.current = video;

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await video.play();

      console.log("Camera started");

      model = await handpose.load();
      console.log("Handpose model loaded");
      setStatus("Show your hand");

      detect();
    }

    async function detect() {
      if (!videoRef.current) return;

      const predictions = await model.estimateHands(videoRef.current);

      if (predictions.length > 0) {
        const landmarks = predictions[0].landmarks;

        const palm = landmarks[9]; // palm center
        const indexTip = landmarks[8]; // index fingertip

        const dx = indexTip[0] - palm[0];

        let newDirection: "EAST" | "WEST" | "CENTER" = "CENTER";

        if (dx > 40) newDirection = "EAST";
        else if (dx < -40) newDirection = "WEST";

        setDirection(newDirection);

        // throttle volume change
        const now = Date.now();
        if (now - lastActionRef.current > 300) {
          if (newDirection === "EAST") {
            setVolume((v) => Math.max(0, v - 2));
            console.log("➡ EAST → Volume Down");
            lastActionRef.current = now;
          }

          if (newDirection === "WEST") {
            setVolume((v) => Math.min(100, v + 2));
            console.log("⬅ WEST → Volume Up");
            lastActionRef.current = now;
          }
        }

        setStatus("Hand detected");
      } else {
        setStatus("No hand");
        setDirection("CENTER");
      }

      rafRef.current = requestAnimationFrame(detect);
    }

    setup();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
        videoRef.current.remove();
      }
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white">
      <h1 className="text-2xl font-bold">Hand Direction Test</h1>

      <div className="text-lg text-red-500 font-bold">STATUS: {status}</div>

      <div className="text-3xl font-bold">
        DIRECTION: <span className="text-green-400">{direction}</span>
      </div>

      <div className="text-2xl">
        VOLUME: <span className="text-yellow-400">{volume}</span>
      </div>

      <p className="text-sm text-gray-400 max-w-md text-center">
        Point your index finger to the right (EAST) to increase volume, left
        (WEST) to decrease volume.
      </p>
    </div>
  );
}
