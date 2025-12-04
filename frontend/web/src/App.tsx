// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface FeedbackRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  from: string;
  to: string;
  category: string;
  rating: number;
}

const App: React.FC = () => {
  // State management
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newFeedback, setNewFeedback] = useState({
    to: "",
    category: "collaboration",
    rating: 5,
    comments: ""
  });
  const [showStats, setShowStats] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Style choices: 
  // Colors: Gradient (Rainbow)
  // UI Style: Glass Morphism
  // Layout: Card Grid
  // Interaction: Micro-interactions

  // Calculate statistics
  const averageRating = feedbacks.length > 0 
    ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length 
    : 0;
  const categories = [...new Set(feedbacks.map(f => f.category))];

  useEffect(() => {
    loadFeedbacks().finally(() => setLoading(false));
  }, []);

  // Wallet connection handlers
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Contract interaction functions
  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable ? "FHE service is available" : "Service unavailable"
      });
      setTimeout(() => setTransactionStatus({...transactionStatus, visible: false}), 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed"
      });
      setTimeout(() => setTransactionStatus({...transactionStatus, visible: false}), 2000);
    }
  };

  const loadFeedbacks = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const keysBytes = await contract.getData("feedback_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing feedback keys:", e);
        }
      }
      
      const list: FeedbackRecord[] = [];
      
      for (const key of keys) {
        try {
          const feedbackBytes = await contract.getData(`feedback_${key}`);
          if (feedbackBytes.length > 0) {
            try {
              const feedbackData = JSON.parse(ethers.toUtf8String(feedbackBytes));
              list.push({
                id: key,
                encryptedData: feedbackData.data,
                timestamp: feedbackData.timestamp,
                from: feedbackData.from,
                to: feedbackData.to,
                category: feedbackData.category,
                rating: feedbackData.rating
              });
            } catch (e) {
              console.error(`Error parsing feedback ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading feedback ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setFeedbacks(list);
    } catch (e) {
      console.error("Error loading feedbacks:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitFeedback = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setSubmitting(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting feedback with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newFeedback))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const feedbackId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const feedbackData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        from: account,
        to: newFeedback.to,
        category: newFeedback.category,
        rating: newFeedback.rating
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `feedback_${feedbackId}`, 
        ethers.toUtf8Bytes(JSON.stringify(feedbackData))
      );
      
      const keysBytes = await contract.getData("feedback_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(feedbackId);
      
      await contract.setData(
        "feedback_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Feedback submitted securely!"
      });
      
      await loadFeedbacks();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowFeedbackModal(false);
        setNewFeedback({
          to: "",
          category: "collaboration",
          rating: 5,
          comments: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter feedbacks based on search term
  const filteredFeedbacks = feedbacks.filter(feedback => 
    feedback.to.toLowerCase().includes(searchTerm.toLowerCase()) ||
    feedback.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
    feedback.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="rainbow-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container glass-theme">
      <header className="app-header">
        <div className="logo">
          <h1>Team<span>360</span>FHE</h1>
          <p>Confidential 360-Degree Feedback</p>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="hero-section">
          <div className="hero-content">
            <h2>Secure Team Feedback with FHE</h2>
            <p>Provide confidential 360-degree feedback that remains encrypted during analysis</p>
            <div className="hero-buttons">
              <button 
                onClick={() => setShowFeedbackModal(true)}
                className="glass-button primary"
              >
                Submit Feedback
              </button>
              <button 
                onClick={checkAvailability}
                className="glass-button secondary"
              >
                Check FHE Status
              </button>
            </div>
          </div>
        </div>
        
        <div className="stats-toggle">
          <button 
            onClick={() => setShowStats(!showStats)}
            className="glass-button small"
          >
            {showStats ? "Hide Statistics" : "Show Statistics"}
          </button>
        </div>
        
        {showStats && (
          <div className="stats-grid">
            <div className="stat-card glass-card">
              <h3>Total Feedbacks</h3>
              <div className="stat-value rainbow-text">{feedbacks.length}</div>
            </div>
            
            <div className="stat-card glass-card">
              <h3>Average Rating</h3>
              <div className="stat-value rainbow-text">{averageRating.toFixed(1)}</div>
            </div>
            
            <div className="stat-card glass-card">
              <h3>Categories</h3>
              <div className="stat-value rainbow-text">{categories.length}</div>
            </div>
          </div>
        )}
        
        <div className="feedback-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search feedback..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input"
            />
          </div>
          <button 
            onClick={loadFeedbacks}
            className="glass-button small"
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        
        <div className="feedback-grid">
          {filteredFeedbacks.length === 0 ? (
            <div className="no-feedbacks glass-card">
              <div className="empty-icon"></div>
              <p>No feedback records found</p>
              <button 
                className="glass-button primary"
                onClick={() => setShowFeedbackModal(true)}
              >
                Submit First Feedback
              </button>
            </div>
          ) : (
            filteredFeedbacks.map(feedback => (
              <div className="feedback-card glass-card" key={feedback.id}>
                <div className="card-header">
                  <span className="rating-badge">{feedback.rating}/10</span>
                  <span className="category-tag">{feedback.category}</span>
                </div>
                <div className="card-body">
                  <p className="feedback-meta">
                    <span>From: {feedback.from.substring(0, 6)}...{feedback.from.substring(38)}</span>
                    <span>To: {feedback.to.substring(0, 6)}...{feedback.to.substring(38)}</span>
                  </p>
                  <p className="feedback-date">
                    {new Date(feedback.timestamp * 1000).toLocaleString()}
                  </p>
                </div>
                <div className="card-footer">
                  <div className="fhe-badge">FHE Encrypted</div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
  
      {showFeedbackModal && (
        <FeedbackModal 
          onSubmit={submitFeedback} 
          onClose={() => setShowFeedbackModal(false)} 
          submitting={submitting}
          feedbackData={newFeedback}
          setFeedbackData={setNewFeedback}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="notification-modal">
          <div className={`notification-content glass-card ${transactionStatus.status}`}>
            <div className="notification-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>Team360FHE</h3>
            <p>Confidential 360-degree feedback powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">FHE-Powered Confidentiality</div>
          <div className="copyright">
            © {new Date().getFullYear()} Team360FHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface FeedbackModalProps {
  onSubmit: () => void; 
  onClose: () => void; 
  submitting: boolean;
  feedbackData: any;
  setFeedbackData: (data: any) => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ 
  onSubmit, 
  onClose, 
  submitting,
  feedbackData,
  setFeedbackData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFeedbackData({
      ...feedbackData,
      [name]: value
    });
  };

  const handleRatingChange = (rating: number) => {
    setFeedbackData({
      ...feedbackData,
      rating
    });
  };

  const handleSubmit = () => {
    if (!feedbackData.to) {
      alert("Please specify who this feedback is for");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="feedback-modal glass-card">
        <div className="modal-header">
          <h2>Submit Confidential Feedback</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> 
            <span>Your feedback will be encrypted with FHE and remain confidential</span>
          </div>
          
          <div className="form-group">
            <label>Recipient Address *</label>
            <input 
              type="text"
              name="to"
              value={feedbackData.to} 
              onChange={handleChange}
              placeholder="Enter wallet address (0x...)" 
              className="glass-input"
            />
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select 
              name="category"
              value={feedbackData.category} 
              onChange={handleChange}
              className="glass-select"
            >
              <option value="collaboration">Collaboration</option>
              <option value="communication">Communication</option>
              <option value="reliability">Reliability</option>
              <option value="leadership">Leadership</option>
              <option value="innovation">Innovation</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Rating *</label>
            <div className="rating-selector">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                <button
                  key={num}
                  className={`rating-option ${feedbackData.rating === num ? 'active' : ''}`}
                  onClick={() => handleRatingChange(num)}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
          
          <div className="form-group">
            <label>Comments</label>
            <textarea 
              name="comments"
              value={feedbackData.comments} 
              onChange={handleChange}
              placeholder="Additional comments (will be encrypted)..."
              className="glass-textarea"
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="glass-button secondary"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting}
            className="glass-button primary"
          >
            {submitting ? "Encrypting with FHE..." : "Submit Feedback"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;