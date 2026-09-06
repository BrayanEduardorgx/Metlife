window.METLIFE_ENV = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  ? 'development'
  : 'production';
window.METLIFE_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAz7PQdl-6H_rjnwIlHviunulsoA_gMyNM',
  authDomain: 'metlife-6d467.firebaseapp.com',
  databaseURL: 'https://metlife-6d467-default-rtdb.firebaseio.com',
  projectId: 'metlife-6d467',
  storageBucket: 'metlife-6d467.firebasestorage.app',
  messagingSenderId: '1046142840408',
  appId: '1:1046142840408:web:da5dbd6c954496ae7fe42d',
};

if (window.METLIFE_ENV === 'development')
  window.METLIFE_FIREBASE_CONFIG = {
    apiKey: 'demo-key',
    projectId: 'demo-metlife',
    authDomain: 'demo-metlife.firebaseapp.com',
    databaseURL: 'https://demo-metlife-default-rtdb.firebaseio.com',
  };
