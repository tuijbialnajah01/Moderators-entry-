import { initializeApp } from 'firebase-admin/app';
try {
  initializeApp();
  console.log("SUCCESS");
} catch(e: any) {
  console.log("FAIL", e.message);
}
