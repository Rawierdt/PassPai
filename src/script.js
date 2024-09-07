/**
 * PassPai - Password Manager
 * @author Rawier <https://rawier.vercel.app>
 * @date 2024-09-07
 * @file src/script.js
 * @license MIT
 * @description JavaScript source code for the PassPai web app.
 * @see https://github.com/Rawierdt/PassPai/
 */

document.addEventListener("DOMContentLoaded", () => {
  // Elementos del DOM
  const passwordManager = document.getElementById("passwordManager");
  const themeToggle = document.getElementById("themeToggle");
  const generateBtn = document.getElementById("generateBtn");
  const currentPasswordInput = document.getElementById("currentPassword");
  const tabs = document.querySelectorAll(".tab");
  const tabContents = document.querySelectorAll(".tab-content");
  const socialButtons = document.querySelectorAll(".social-buttons .btn");
  const copyButtons = document.querySelectorAll(".password-manager .btn-icon");
  const downloadBtn = document.getElementById("downloadBtn");
  const loadBtn = document.getElementById("loadBtn");
  const fileInput = document.getElementById("fileInput");
  const passwordModal = document.getElementById("passwordModal");
  const modalClose = document.querySelector("#passwordModal .close");
  const modalConfirmBtn = document.getElementById("modalConfirmBtn");
  const modalMasterPasswordInput = document.getElementById("modalMasterPasswordInput");

  // Estado
  let currentPassword = "";
  const passwords = {};
  let masterPassword = null;
  let encryptionKey = null;
  let iv = null;

  // Funciones
  function toggleTheme() {
    if (passwordManager.classList.contains("dark")) {
      passwordManager.classList.remove("dark");
      passwordManager.classList.add("light");
      localStorage.setItem("theme", "light");
      themeToggle.innerHTML = '<i class="mdi mdi-weather-night"></i>';
    } else {
      passwordManager.classList.remove("light");
      passwordManager.classList.add("dark");
      localStorage.setItem("theme", "dark");
      themeToggle.innerHTML = '<i class="mdi mdi-white-balance-sunny"></i>';
    }
  }

  function generatePassword() {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let password = "";
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    currentPassword = password;
    currentPasswordInput.value = password;
  }

  function savePassword(network) {
    if (currentPassword) {
      passwords[network] = currentPassword;
      updatePasswordManager();
      currentPassword = "";
      currentPasswordInput.value = "";
    }
  }

  function updatePasswordManager() {
    const passwordItems = document.querySelectorAll(".password-item");
    passwordItems.forEach((item) => {
      const network = item.querySelector("label").textContent.replace(":", "");
      const input = item.querySelector("input");
      const copyBtn = item.querySelector(".btn-icon");
      if (passwords[network]) {
        input.value = passwords[network];
        copyBtn.disabled = false;
      } else {
        input.value = "";
        input.placeholder = "Sin contraseña guardada";
        copyBtn.disabled = true;
      }
    });
  }

  function copyToClipboard(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        alert("Contraseña copiada al portapapeles");
      })
      .catch((err) => {
        console.error("Error al copiar: ", err);
      });
  }

  function promptForMasterPassword(callback) {
    passwordModal.style.display = "block";
    modalConfirmBtn.onclick = () => {
      const enteredPassword = modalMasterPasswordInput.value;
      if (enteredPassword) {
        callback(enteredPassword);
        passwordModal.style.display = "none";
      } else {
        alert("Por favor, ingresa una contraseña.");
      }
    };
    modalClose.onclick = () => {
      passwordModal.style.display = "none";
    };
  }

  function generateEncryptionKey(password) {
    const encoder = new TextEncoder();
    const keyMaterial = crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return keyMaterial.then(keyMaterial => {
      return crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: encoder.encode(password), 
          // la sal en este caso es el propio master password, por simplicidad y flojera XD
          iterations: 100000,
          hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
    });
  }

  function savePasswordsToFile() {
    promptForMasterPassword((password) => {
      generateEncryptionKey(password).then(key => {
        encryptionKey = key;
        iv = crypto.getRandomValues(new Uint8Array(12)); // IV debe ser único para cada cifrado

        const passwordEntries = Object.entries(passwords);
        if (passwordEntries.length === 0) {
          alert("No hay contraseñas guardadas para descargar.");
          return;
        }

        let passwordText = "Red Social - Contraseña\n";
        // Eso ultimo no tiene utilidad pero aun asi esta
        passwordEntries.forEach(([network, password]) => {
          passwordText += `${network}: ${password}\n`;
        });

        return crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: iv
          },
          encryptionKey,
          new TextEncoder().encode(passwordText)
        ).then(encryptedText => {
          const blob = new Blob([iv, new Uint8Array(encryptedText)], { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "mypasswords.pai";
          // la extensión del archivo es PAI para comodidad
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
      });
    });
  }

  function loadPasswords(event) {
    promptForMasterPassword((password) => {
      const file = event.target.files[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const contents = new Uint8Array(e.target.result);
        const fileIv = contents.slice(0, 12); // El IV está al principio del archivo
        const encryptedData = contents.slice(12); // Los datos cifrados vienen después del IV

        generateEncryptionKey(password).then(key => {
          encryptionKey = key;

          return crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: fileIv
            },
            encryptionKey,
            encryptedData
          ).then(decryptedText => {
            const passwordText = new TextDecoder().decode(decryptedText);
            const lines = passwordText.split("\n");
            lines.forEach((line) => {
              const [network, password] = line.split(":");
              if (network && password) {
                passwords[network.trim()] = password.trim();
              }
            });
            updatePasswordManager();
            alert("Contraseñas cargadas exitosamente.");
          }).catch(() => {
            alert("Contraseña maestra incorrecta.");
          });
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Manejadores de eventos
  themeToggle.addEventListener("click", toggleTheme);
  generateBtn.addEventListener("click", generatePassword);
  downloadBtn.addEventListener("click", savePasswordsToFile);
  loadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", loadPasswords);

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const tabId = tab.getAttribute("data-tab");
      tabContents.forEach((content) => {
        content.classList.remove("active");
        if (content.id === `${tabId}Tab`) {
          content.classList.add("active");
        }
      });
    });
  });

  socialButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const network = button.getAttribute("data-network");
      savePassword(network);
    });
  });

  copyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const passwordInput = button.previousElementSibling;
      copyToClipboard(passwordInput.value);
    });
  });

  // Inicialización
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    passwordManager.classList.add("dark");
    themeToggle.innerHTML = '<i class="mdi mdi-white-balance-sunny"></i>';
  } else {
    passwordManager.classList.add("light");
    themeToggle.innerHTML = '<i class="mdi mdi-weather-night"></i>';
  }
});
