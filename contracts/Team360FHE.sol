// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract Team360FHE is SepoliaConfig {
    struct EncryptedFeedback {
        uint256 id;
        address reviewer;
        address reviewee;
        euint32 encryptedScore;
        euint32 encryptedCategory;
        uint256 timestamp;
    }

    struct DecryptedFeedback {
        uint32 score;
        string category;
        bool isRevealed;
    }

    struct TeamSummary {
        euint32 encryptedTotalScore;
        euint32 encryptedFeedbackCount;
    }

    uint256 public feedbackCount;
    mapping(uint256 => EncryptedFeedback) public encryptedFeedbacks;
    mapping(uint256 => DecryptedFeedback) public decryptedFeedbacks;
    mapping(address => TeamSummary) public teamSummaries;
    
    mapping(string => euint32) private encryptedCategoryStats;
    string[] private categoryList;
    
    mapping(uint256 => uint256) private requestToFeedbackId;
    
    event FeedbackSubmitted(uint256 indexed id, address reviewer, address reviewee, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event FeedbackDecrypted(uint256 indexed id);
    event TeamSummaryUpdated(address indexed teamAddress);
    
    modifier onlyManager(address teamAddress) {
        _;
    }
    
    function submitEncryptedFeedback(
        address reviewee,
        euint32 encryptedScore,
        euint32 encryptedCategory
    ) public {
        feedbackCount += 1;
        uint256 newId = feedbackCount;
        
        encryptedFeedbacks[newId] = EncryptedFeedback({
            id: newId,
            reviewer: msg.sender,
            reviewee: reviewee,
            encryptedScore: encryptedScore,
            encryptedCategory: encryptedCategory,
            timestamp: block.timestamp
        });
        
        decryptedFeedbacks[newId] = DecryptedFeedback({
            score: 0,
            category: "",
            isRevealed: false
        });
        
        TeamSummary storage summary = teamSummaries[reviewee];
        if (!FHE.isInitialized(summary.encryptedTotalScore)) {
            summary.encryptedTotalScore = FHE.asEuint32(0);
            summary.encryptedFeedbackCount = FHE.asEuint32(0);
        }
        summary.encryptedTotalScore = FHE.add(summary.encryptedTotalScore, encryptedScore);
        summary.encryptedFeedbackCount = FHE.add(summary.encryptedFeedbackCount, FHE.asEuint32(1));
        
        emit FeedbackSubmitted(newId, msg.sender, reviewee, block.timestamp);
        emit TeamSummaryUpdated(reviewee);
    }
    
    function requestFeedbackDecryption(uint256 feedbackId) public {
        EncryptedFeedback storage feedback = encryptedFeedbacks[feedbackId];
        require(msg.sender == feedback.reviewer || msg.sender == feedback.reviewee, "Not authorized");
        require(!decryptedFeedbacks[feedbackId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(feedback.encryptedScore);
        ciphertexts[1] = FHE.toBytes32(feedback.encryptedCategory);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptFeedback.selector);
        requestToFeedbackId[reqId] = feedbackId;
        
        emit DecryptionRequested(feedbackId);
    }
    
    function decryptFeedback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 feedbackId = requestToFeedbackId[requestId];
        require(feedbackId != 0, "Invalid request");
        
        EncryptedFeedback storage eFeedback = encryptedFeedbacks[feedbackId];
        DecryptedFeedback storage dFeedback = decryptedFeedbacks[feedbackId];
        require(!dFeedback.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 score, string memory category) = abi.decode(cleartexts, (uint32, string));
        
        dFeedback.score = score;
        dFeedback.category = category;
        dFeedback.isRevealed = true;
        
        if (FHE.isInitialized(encryptedCategoryStats[category]) == false) {
            encryptedCategoryStats[category] = FHE.asEuint32(0);
            categoryList.push(category);
        }
        encryptedCategoryStats[category] = FHE.add(
            encryptedCategoryStats[category], 
            FHE.asEuint32(1)
        );
        
        emit FeedbackDecrypted(feedbackId);
    }
    
    function requestTeamSummaryDecryption(address teamAddress) public onlyManager(teamAddress) {
        TeamSummary storage summary = teamSummaries[teamAddress];
        require(FHE.isInitialized(summary.encryptedTotalScore), "No data");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(summary.encryptedTotalScore);
        ciphertexts[1] = FHE.toBytes32(summary.encryptedFeedbackCount);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptTeamSummary.selector);
        requestToFeedbackId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(teamAddress)));
    }
    
    function decryptTeamSummary(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 teamHash = requestToFeedbackId[requestId];
        address teamAddress = address(uint160(teamHash));
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 totalScore, uint32 feedbackCount) = abi.decode(cleartexts, (uint32, uint32));
    }
    
    function getDecryptedFeedback(uint256 feedbackId) public view returns (
        uint32 score,
        string memory category,
        bool isRevealed
    ) {
        DecryptedFeedback storage f = decryptedFeedbacks[feedbackId];
        return (f.score, f.category, f.isRevealed);
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
}