# In /backend/utils/abi_loader.py

import json
from typing import Any

def load_contract_abi(artifact_path: str) -> Any:
    """
    Loads a contract's ABI from its corresponding Hardhat JSON artifact file.

    Args:
        artifact_path (str): The relative path to the JSON artifact file.
                             e.g., "abi/CollateralVault.json"

    Returns:
        The contract ABI as a list of dictionaries.

    Raises:
        FileNotFoundError: If the artifact file cannot be found.
        ValueError: If the file is not a valid JSON or doesn't contain an 'abi' key.
    """
    try:
        with open(artifact_path, 'r') as f:
            artifact = json.load(f)
            if 'abi' not in artifact:
                raise ValueError(f"ABI key not found in artifact: {artifact_path}")
            return artifact['abi']
    except FileNotFoundError:
        raise FileNotFoundError(f"Could not find ABI artifact file at: {artifact_path}")
    except json.JSONDecodeError:
        raise ValueError(f"Failed to decode JSON from artifact file: {artifact_path}")