# Sample conversations — Demo 2 test script

Send these from your phone to the Meta test number (see README setup), in order. Each row shows what the assistant should do.

| # | You send | Expected behaviour |
|---|---|---|
| 1 | Hi! What are your prices for a haircut and facial? | Answers from the knowledge base only: Haircut & Styling ₹499–₹899, Facial ₹1,299. Intent logged as `price`. No owner alert. |
| 2 | Are you open on Tuesday? | Says the salon is **closed on Tuesdays**, offers another day. (Tests that it uses the hours fact instead of guessing.) |
| 3 | I want to book a hair spa tomorrow at 4 pm | Detects booking intent with service + day + time complete → confirms the booking, logs it, and **emails the owner** the booking details. |
| 4 | Book me a manicure | Missing day/time → asks for just the missing piece, does not confirm anything yet. |
| 5 | Do you do keratin treatment? How much? | Keratin is **not in the knowledge base** → polite holding reply ("the team will respond shortly"), `needs_human` = true, owner gets an alert email. It must NOT invent a price. |
| 6 | This is ridiculous, my appointment last week was messed up | Complaint → holding reply + owner alert. No arguing, no promises. |
| 7 | (send a photo or voice note) | Non-text message → fallback reply asking them to type the question. Nothing crashes. |

After the run, open the **Conversations** sheet: every exchange should be one logged row with the customer message, the reply sent, the intent, and whether a human was needed.
