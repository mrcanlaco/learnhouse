import httpx
import logging
from fastapi import HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from src.db.users import User
from src.services.users.users import get_user_by_email, create_user
from src.db.organizations import Organization
from sqlmodel import select
from src.db.roles import Role

logger = logging.getLogger(__name__)

async def verify_supabase_token(supabase_url: str, supabase_key: str, token: str) -> dict:
    """
    Verify the Supabase access token by making a request to the Supabase Auth API.
    Returns the user data dict if valid.
    Raises HTTPException if invalid.
    """
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=500, detail="Supabase configuration is missing on the server.")

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {token}"
    }

    user_endpoint = f"{supabase_url.rstrip('/')}/auth/v1/user"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(user_endpoint, headers=headers)
        
        if response.status_code != 200:
            logger.error(f"Supabase token verification failed: {response.text}")
            raise HTTPException(status_code=401, detail="Invalid Supabase token")
            
        return response.json()


async def get_or_create_supabase_user(
    db_session: AsyncSession, 
    user_data: dict, 
    org_id: int
) -> User:
    """
    Finds an existing user by email or creates a new one based on Supabase user data.
    """
    email = user_data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email provided in Supabase user data")

    user = await get_user_by_email(db_session, email)
    
    if user:
        return user
        
    # JIT Provisioning
    user_metadata = user_data.get("user_metadata", {})
    # Attempt to extract name from metadata
    full_name = user_metadata.get("full_name") or user_metadata.get("name") or ""
    first_name = ""
    last_name = ""
    
    if full_name:
        parts = full_name.split(" ", 1)
        first_name = parts[0]
        if len(parts) > 1:
            last_name = parts[1]
    
    avatar_url = user_metadata.get("avatar_url") or user_metadata.get("picture")

    # Get student role
    role_stmt = select(Role).where(Role.name == "student")
    role_result = await db_session.execute(role_stmt)
    student_role = role_result.scalars().first()
    
    if not student_role:
        raise HTTPException(status_code=500, detail="Default student role not found")

    new_user = await create_user(
        db_session=db_session,
        email=email,
        password=None, # SSO user
        first_name=first_name,
        last_name=last_name,
        org_id=org_id,
        role_id=student_role.id
    )

    # Note: create_user handles the creation of OrgUser mapping if org_id is provided.
    
    # We might need to manually set email_verified since they are coming from SSO
    if hasattr(new_user, "email_verified"):
        new_user.email_verified = True
        db_session.add(new_user)
        await db_session.commit()
        await db_session.refresh(new_user)
        
    return new_user
