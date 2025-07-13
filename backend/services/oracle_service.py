from dependencies import w3
from services.contract_service import get_price_feed_contract

def get_price_from_oracle():
    """
    Fetches the latest price from the Chainlink price feed contract.
    """
    try:
        price_feed_contract = get_price_feed_contract()
        latest_round_data = price_feed_contract.functions.latestRoundData().call()
        price = latest_round_data[1]
        decimals = price_feed_contract.functions.decimals().call()
        return price, decimals
    except Exception as e:
        print(f"Error fetching price from oracle: {e}")
        raise

def update_price_in_oracle(new_price):
    """
    Updates the price in a mock oracle. This is for testing/development.
    """
    if not w3 or not w3.eth.default_account:
        raise ConnectionError("Web3 client or admin account not configured for signing transactions.")

    try:
        price_feed_contract = get_price_feed_contract()
        # This assumes the contract has an 'updateAnswer' function, typical for mocks.
        tx_hash = price_feed_contract.functions.updateAnswer(new_price).transact({
            'from': w3.eth.default_account
        })
        w3.eth.wait_for_transaction_receipt(tx_hash)
        return tx_hash.hex()
    except Exception as e:
        print(f"Error updating price in oracle: {e}")
        raise
