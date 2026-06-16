// DAZ mobile app (Expo + WebView) — connects to your DAZ server.
// Edit SERVER below to your server's address, then build/run with Expo.
// (Or just install the PWA from the browser — no build needed.)
import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';

const SERVER = 'http://192.168.1.100:8080'; // ← آدرس سرور DAZ خودت را بگذار

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f1419' }}>
      <StatusBar barStyle="light-content" />
      <WebView
        source={{ uri: SERVER }}
        style={{ flex: 1, backgroundColor: '#0f1419' }}
        // allow microphone (voice input) inside the WebView
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
      />
    </SafeAreaView>
  );
}
